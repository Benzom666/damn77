import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, photoData, signatureData, notes, recipientName } = body

    console.log("[v0] [API] Starting delivery submission for order:", orderId)

    const supabase = await createServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[v0] [API] Auth error:", authError)
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
    }

    let photoUrl: string | undefined
    let signatureUrl: string | undefined

    if (photoData) {
      try {
        console.log("[v0] [API] Uploading photo...")
        const base64Parts = photoData.split(",")
        const base64String = base64Parts[1]
        const byteString = atob(base64String)
        const byteArray = new Uint8Array(byteString.length)
        for (let i = 0; i < byteString.length; i++) {
          byteArray[i] = byteString.charCodeAt(i)
        }
        const blob = new Blob([byteArray], { type: "image/jpeg" })
        const result = await put(`pod-photos/${orderId}-${Date.now()}.jpg`, blob, {
          access: "public",
          contentType: "image/jpeg",
        })
        photoUrl = result.url
        console.log("[v0] [API] Photo uploaded:", photoUrl)
      } catch (error) {
        console.error("[v0] [API] Photo upload failed:", error)
        return NextResponse.json({ success: false, error: "Failed to upload photo" }, { status: 500 })
      }
    }

    if (signatureData) {
      try {
        console.log("[v0] [API] Uploading signature...")
        const base64Parts = signatureData.split(",")
        const base64String = base64Parts[1]
        const byteString = atob(base64String)
        const byteArray = new Uint8Array(byteString.length)
        for (let i = 0; i < byteString.length; i++) {
          byteArray[i] = byteString.charCodeAt(i)
        }
        const blob = new Blob([byteArray], { type: "image/png" })
        const result = await put(`pod-signatures/${orderId}-${Date.now()}.png`, blob, {
          access: "public",
          contentType: "image/png",
        })
        signatureUrl = result.url
        console.log("[v0] [API] Signature uploaded:", signatureUrl)
      } catch (error) {
        console.error("[v0] [API] Signature upload failed:", error)
        return NextResponse.json({ success: false, error: "Failed to upload signature" }, { status: 500 })
      }
    }

    const podNotes = recipientName ? `Recipient: ${recipientName}\n${notes || ""}` : notes

    const { data: podData, error: podError } = await supabase
      .from("pods")
      .insert({
        order_id: orderId,
        driver_id: user.id,
        photo_url: photoUrl,
        signature_url: signatureUrl,
        notes: podNotes,
        delivered_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (podError) {
      console.error("[v0] [API] POD save error:", podError)
      return NextResponse.json({ success: false, error: "Failed to save proof of delivery" }, { status: 500 })
    }

    console.log("[v0] [API] POD saved:", podData.id)

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        status: "delivered",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)

    if (orderError) {
      console.error("[v0] [API] Order update error:", orderError)
      return NextResponse.json({ success: false, error: "Failed to update order status" }, { status: 500 })
    }

    await supabase.from("stop_events").insert({
      order_id: orderId,
      driver_id: user.id,
      event_type: "delivered",
      notes,
    })

    console.log("[v0] [API] Order marked as delivered")

    const enableEmail = process.env.NEXT_PUBLIC_ENABLE_POD_EMAIL === "true"
    console.log("[v0] [API] Email enabled:", enableEmail, "POD ID:", podData?.id)

    if (podData?.id && enableEmail) {
      console.log("[v0] [API] Sending POD email...")
      const origin = request.headers.get("origin") || ""
      fetch(`${origin}/api/pod-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, podId: podData.id }),
      })
        .then((res) => res.json())
        .then((data) => console.log("[v0] [API] Email response:", data))
        .catch((e) => console.warn("[v0] [API] Email failed (non-blocking):", e))
    } else if (!enableEmail) {
      console.log("[v0] [API] Email disabled via NEXT_PUBLIC_ENABLE_POD_EMAIL")
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] [API] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 },
    )
  }
}
