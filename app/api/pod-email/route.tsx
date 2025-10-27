export const runtime = "edge"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendSendgridMail } from "@/lib/mail/sendgrid-http"

function j(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()

  try {
    const { orderId, podId } = await req.json()

    const apiKey = process.env.SEND_GRID_API_KEY || process.env.SENDGRID_API_KEY || ""
    const from = process.env.DELIVERY_FROM_EMAIL || ""

    console.log("[MAIL][POD] Starting email for order:", orderId, "POD:", podId)
    console.log("[MAIL][POD] API key exists:", !!apiKey, "From email:", from)

    if (!apiKey || !from) {
      console.error("[MAIL][POD] Missing environment variables")
      return j(500, {
        ok: false,
        error: "Missing SEND_GRID_API_KEY or DELIVERY_FROM_EMAIL",
      })
    }

    // Try to get customer_email if it exists (from migration 011), otherwise skip email
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select("id, customer_name, address, city, state, zip")
      .eq("id", orderId)
      .single()

    if (oe || !order) {
      console.error("[MAIL][POD] Order not found:", oe)
      return j(400, {
        ok: false,
        error: "Order not found",
        detail: oe,
      })
    }

    const { data: emailData, error: emailError } = await supabase
      .from("orders")
      .select("customer_email")
      .eq("id", orderId)
      .single()

    // If customer_email column doesn't exist or email is missing, skip sending
    if (emailError || !emailData?.customer_email) {
      console.log("[MAIL][POD] customer_email column missing or empty, skipping email")
      return j(200, {
        ok: true,
        skipped: true,
        reason: "customer_email not available (run migration 011_require_customer_email.sql)",
      })
    }

    const customerEmail = emailData.customer_email

    const { data: exists } = await supabase.from("pod_emails").select("pod_id").eq("pod_id", podId).maybeSingle()

    if (exists) {
      console.log("[MAIL][POD] Email already sent for POD:", podId)
      return j(200, { ok: true, alreadySent: true })
    }

    const { data: pod, error: pe } = await supabase
      .from("pods")
      .select("photo_url, signature_url, notes, delivered_at")
      .eq("id", podId)
      .single()

    if (pe) {
      console.error("[MAIL][POD] POD missing:", pe)
      return j(400, { ok: false, error: "POD missing", detail: pe })
    }

    const fullAddress = [order.address, order.city, order.state, order.zip].filter(Boolean).join(", ")

    const html = `
      <h2>Delivery Complete – Order ${order.id.slice(0, 8)}</h2>
      <p><b>Customer:</b> ${order.customer_name}</p>
      <p><b>Delivered at:</b> ${pod.delivered_at ?? new Date().toISOString()}</p>
      <p><b>Address:</b> ${fullAddress}</p>
      ${pod.notes ? `<p><b>Notes:</b> ${pod.notes}</p>` : ""}
      ${pod.photo_url ? `<p><a href="${pod.photo_url}">View delivery photo</a></p>` : ""}
      ${pod.signature_url ? `<p><a href="${pod.signature_url}">View signature</a></p>` : ""}
    `.trim()

    const resp = await sendSendgridMail({
      apiKey,
      from,
      to: customerEmail,
      subject: `Proof of Delivery – ${order.customer_name}`,
      html,
    })

    console.log("[MAIL][POD] SendGrid response:", resp)

    if (resp.ok) {
      await supabase.from("pod_emails").insert({
        pod_id: podId,
        order_id: orderId,
        to_email: customerEmail,
        provider_message_id: resp.headers["x-message-id"] ?? "accepted",
      })
      return j(200, resp)
    }

    return j(500, resp)
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error("[MAIL][POD] Unhandled error:", msg)
    return j(500, { ok: false, error: msg })
  }
}
