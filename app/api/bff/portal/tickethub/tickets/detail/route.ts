import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientName: string; ticketId: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName || !payload.ticketId) return NextResponse.json({ ok: false, error: "clientName + ticketId required" }, { status: 400 })

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })

  const ticket = await prisma.tH_Ticket.findFirst({
    where: { id: payload.ticketId, clientId: client.id, deletedAt: null },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      description: true,
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
  })
  if (!ticket) return NextResponse.json({ ok: false, error: "ticket not found" }, { status: 404 })

  const [comments, attachments] = await Promise.all([
    prisma.tH_TicketComment.findMany({
      where: { ticketId: ticket.id, isInternal: false },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tH_Attachment.findMany({
      where: { ticketId: ticket.id },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return NextResponse.json({ ok: true, ticket, comments, attachments })
}
