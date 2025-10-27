import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function runMigration(filename: string) {
  console.log(`\n📝 Running migration: ${filename}`)

  try {
    const sqlPath = join(process.cwd(), "scripts", filename)
    const sql = readFileSync(sqlPath, "utf-8")

    // Split by semicolons and execute each statement
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"))

    for (const statement of statements) {
      const { error } = await supabase.rpc("exec_sql", { sql_query: statement })

      if (error) {
        // Try direct execution if rpc fails
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ sql_query: statement }),
        })

        if (!response.ok) {
          console.error(`❌ Error executing statement: ${error.message}`)
          console.error(`Statement: ${statement.substring(0, 100)}...`)
        }
      }
    }

    console.log(`✅ Migration ${filename} completed successfully`)
  } catch (error) {
    console.error(`❌ Error running migration ${filename}:`, error)
    throw error
  }
}

async function main() {
  console.log("🚀 Starting database migrations...\n")

  const migrations = ["001_create_tables.sql", "002_enable_rls.sql", "003_create_profile_trigger.sql"]

  for (const migration of migrations) {
    await runMigration(migration)
  }

  console.log("\n✨ All migrations completed successfully!")
}

main().catch(console.error)
