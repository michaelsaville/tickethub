import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { sendMail, m365Configured } from "@/app/lib/m365"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"

export const dynamic = "force-dynamic"

const PREVIEW_CAP = 2000

interface BffPayload {
  to: string
  subject: string
  html: string
  toName?: string | null
  metadata?: Record<string, unknown>
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })
  }

  let payload: BffPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }
  if (!payload.to || !payload.subject || !payload.html) {
    return NextResponse.json({ ok: false, error: "to, subject, html required" }, { status: 400 })
  }

  if (!m365Configured()) {
    const row = await prisma.tH_TicketEmailOutbound.create({
      data: {
        ticketId: null,
        mode: "PORTAL_RELAY",
        toEmail: payload.to.toLowerCase(),
        toName: payload.toName ?? null,
        subject: payload.subject,
        bodyPreview: payload.html.slice(0, PREVIEW_CAP),
        status: "FAILED",
        errorMessage: "M365 not configured on TicketHub",
        metadata: { source: "portal", ...(payload.metadata ?? {}) },
      },
    })
    return NextResponse.json(
      { ok: false, loggedAs: row.id, error: "M365 not configured on TicketHub" },
      { status: 503 },
    )
  }

  let deliveryError: string | null = null
  try {
    await sendMail({ to: [payload.to], subject: payload.subject, html: payload.html })
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err)
    console.error("[bff/portal/send-email] delivery failed", err)
  }

  const row = await prisma.tH_TicketEmailOutbound.create({
    data: {
      ticketId: null,
      mode: "PORTAL_RELAY",
      toEmail: payload.to.toLowerCase(),
      toName: payload.toName ?? null,
      subject: payload.subject,
      bodyPreview: payload.html.slice(0, PREVIEW_CAP),
      status: deliveryError ? "FAILED" : "SENT",
      errorMessage: deliveryError,
      metadata: { source: "portal", ...(payload.metadata ?? {}) },
    },
  })

  if (deliveryError) {
    return NextResponse.json(
      { ok: false, loggedAs: row.id, error: deliveryError },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, loggedAs: row.id })
}
