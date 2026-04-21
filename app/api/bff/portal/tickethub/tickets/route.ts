import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"

export const dynamic = "force-dynamic"

/**
 * Read tickets for the portal. Accepts `clientName` in the payload
 * because portal-side link table tracks DocHub Client.id, not TH
 * Client.id — they're matched by exact name at the TH layer.
 * HMAC-verified; portal is the only trusted caller.
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

  let payload: { clientName: string; limit?: number }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName) return NextResponse.json({ ok: false, error: "clientName required" }, { status: 400 })

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true, name: true },
  })
  if (!client) return NextResponse.json({ ok: true, client: null, tickets: [] })

  const limit = Math.min(payload.limit ?? 50, 200)
  const tickets = await prisma.tH_Ticket.findMany({
    where: { clientId: client.id, deletedAt: null },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      board: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      site: { select: { name: true } },
      assignedTo: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ ok: true, client, tickets })
}
