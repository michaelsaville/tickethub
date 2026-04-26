import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { verifyPortalHmac } from '@/app/lib/bff-hmac'

export const dynamic = 'force-dynamic'

/**
 * Lightweight polling endpoint for the portal chat panel. Returns just
 * what the chat UI needs to render — public comments + ticket status —
 * without the original description / attachments / contact metadata that
 * `tickets/detail` returns. Kept fast so a 5–10 s poll cadence is cheap.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get('x-portal-signature'),
    req.headers.get('x-portal-timestamp'),
    process.env.PORTAL_BFF_SECRET ?? '',
  )
  if (!verify.ok) {
    return NextResponse.json(
      { ok: false, error: verify.reason },
      { status: verify.status },
    )
  }

  let payload: { clientName: string; ticketId: string; sinceId?: string }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON body' },
      { status: 400 },
    )
  }
  if (!payload.clientName || !payload.ticketId) {
    return NextResponse.json(
      { ok: false, error: 'clientName + ticketId required' },
      { status: 400 },
    )
  }

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) {
    return NextResponse.json(
      { ok: false, error: 'client not found' },
      { status: 404 },
    )
  }

  const ticket = await prisma.tH_Ticket.findFirst({
    where: { id: payload.ticketId, clientId: client.id, deletedAt: null },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      assignedTo: { select: { name: true } },
    },
  })
  if (!ticket) {
    return NextResponse.json(
      { ok: false, error: 'ticket not found' },
      { status: 404 },
    )
  }

  const comments = await prisma.tH_TicketComment.findMany({
    where: { ticketId: ticket.id, isInternal: false },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  })

  return NextResponse.json({
    ok: true,
    ticket: {
      id: ticket.id,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
      assignedTo: ticket.assignedTo,
    },
    comments,
  })
}
