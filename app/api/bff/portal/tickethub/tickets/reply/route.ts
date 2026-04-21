import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"
import { createComment } from "@/app/lib/comments-core"

export const dynamic = "force-dynamic"

/**
 * Portal-originated public reply on a ticket. Portal validates session
 * and client membership before calling this; TH re-verifies that the
 * target ticket belongs to the named client as a second guard.
 *
 * createComment() requires a real TH_User authorId, so we attribute the
 * comment to the oldest GLOBAL_ADMIN (same convention as the inbound-
 * email pipeline) and prefix the body with the portal user's name+email.
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
    ticketId: string
    body: string
    authorName: string
    authorEmail: string
    clientOpId?: string
  }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName || !payload.ticketId || !payload.body?.trim() || !payload.authorEmail) {
    return NextResponse.json({ ok: false, error: "clientName, ticketId, body, authorEmail required" }, { status: 400 })
  }
  if (payload.body.length > 20_000) {
    return NextResponse.json({ ok: false, error: "body too long (max 20KB)" }, { status: 400 })
  }

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })

  const ticket = await prisma.tH_Ticket.findFirst({
    where: { id: payload.ticketId, clientId: client.id, deletedAt: null },
    select: { id: true },
  })
  if (!ticket) return NextResponse.json({ ok: false, error: "ticket not found" }, { status: 404 })

  const sysUser = await prisma.tH_User.findFirst({
    where: { role: "GLOBAL_ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  if (!sysUser) return NextResponse.json({ ok: false, error: "no system actor configured on TicketHub" }, { status: 500 })

  const prefixedBody = `From: ${payload.authorName || payload.authorEmail} <${payload.authorEmail}> (portal)\n\n${payload.body.trim()}`

  const result = await createComment(
    sysUser.id,
    ticket.id,
    prefixedBody,
    false, // public
    payload.clientOpId ?? null,
  )
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error ?? "reply failed" }, { status: 500 })

  await prisma.tH_Ticket.update({
    where: { id: ticket.id },
    data: { lastClientReply: new Date(), isUnread: true },
  })

  return NextResponse.json({ ok: true })
}
