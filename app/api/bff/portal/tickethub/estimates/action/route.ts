import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"
import { emit } from "@/app/lib/automation/bus"
import { EVENT_TYPES } from "@/app/lib/automation/events"

export const dynamic = "force-dynamic"

/**
 * Client approve/decline on an estimate. Only SENT estimates are
 * actionable. Approve bumps status + approvedAt; decline bumps status
 * + declinedAt and appends the optional note + author attribution to
 * the estimate.notes field for the staff audit trail.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: {
    clientName: string
    estimateId: string
    action: "approve" | "decline"
    note?: string
    authorName: string
    authorEmail: string
  }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName || !payload.estimateId || !payload.action || !payload.authorEmail) {
    return NextResponse.json({ ok: false, error: "clientName, estimateId, action, authorEmail required" }, { status: 400 })
  }
  if (payload.action !== "approve" && payload.action !== "decline") {
    return NextResponse.json({ ok: false, error: "action must be approve or decline" }, { status: 400 })
  }

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })

  const estimate = await prisma.tH_Estimate.findFirst({
    where: { id: payload.estimateId, clientId: client.id, status: "SENT" },
    select: { id: true, notes: true },
  })
  if (!estimate) {
    return NextResponse.json({ ok: false, error: "estimate not found or not in SENT status" }, { status: 404 })
  }

  const now = new Date()
  const authorTag = `${payload.authorName || payload.authorEmail} <${payload.authorEmail}> (portal)`
  const noteLine = `[${now.toISOString().slice(0, 10)}] ${payload.action === "approve" ? "Approved" : "Declined"} by ${authorTag}${payload.note ? `: ${payload.note.trim()}` : ""}`
  const combinedNotes = estimate.notes ? `${estimate.notes}\n${noteLine}` : noteLine

  const updated = await prisma.tH_Estimate.update({
    where: { id: estimate.id },
    data: {
      status: payload.action === "approve" ? "APPROVED" : "DECLINED",
      approvedAt: payload.action === "approve" ? now : undefined,
      declinedAt: payload.action === "decline" ? now : undefined,
      notes: combinedNotes,
    },
    select: { id: true, status: true, approvedAt: true, declinedAt: true },
  })

  await emit({
    type:
      payload.action === "approve"
        ? EVENT_TYPES.ESTIMATE_APPROVED
        : EVENT_TYPES.ESTIMATE_DECLINED,
    entityType: "estimate",
    entityId: estimate.id,
    actorId: null,
    payload: {
      clientId: client.id,
      viaPortal: true,
      portalAuthorEmail: payload.authorEmail,
      portalAuthorName: payload.authorName || null,
      note: payload.note || null,
    },
  })

  return NextResponse.json({ ok: true, estimate: updated })
}
