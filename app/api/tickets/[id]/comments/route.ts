import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/app/lib/api-auth'
import { createComment } from '@/app/lib/comments-core'
import { prisma } from '@/app/lib/prisma'
import { sendTicketClientEmail } from '@/app/lib/ticket-email'

/**
 * REST endpoint for creating a ticket comment. Mirrors the `addComment`
 * server action so the offline sync queue can replay queued comments by
 * re-POSTing them when the client comes back online.
 *
 * Body: { body: string, isInternal: boolean, clientOpId?: string }
 *
 * `clientOpId` is an optional idempotency token — if the same op is
 * replayed after a partial-success network failure, we short-circuit
 * rather than double-post. Stored on the TicketComment record.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { body?: unknown; isInternal?: unknown; clientOpId?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const body = typeof payload.body === 'string' ? payload.body : ''
  const isInternal = payload.isInternal === true
  const clientOpId =
    typeof payload.clientOpId === 'string' ? payload.clientOpId : null

  if (clientOpId) {
    const existing = await prisma.tH_TicketComment.findFirst({
      where: { ticketId, clientOpId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { data: { id: existing.id, deduplicated: true }, error: null },
        { status: 200 },
      )
    }
  }

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  })
  if (!ticket) {
    return NextResponse.json(
      { data: null, error: 'Ticket not found' },
      { status: 404 },
    )
  }

  const res = await createComment(
    session!.user.id,
    ticketId,
    body,
    isInternal,
    clientOpId,
  )
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }

  revalidatePath(`/tickets/${ticketId}`)
  if (!isInternal) {
    void sendTicketClientEmail({
      ticketId,
      mode: 'STAFF_REPLY',
      messageText: body,
    })
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 201 })
}
