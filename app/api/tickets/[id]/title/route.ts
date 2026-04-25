import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

const MAX_TITLE_LEN = 200

/**
 * PATCH /api/tickets/[id]/title — inline edit from the ticket detail page.
 * Logs a TITLE_CHANGE event so the timeline shows old → new.
 *
 * Body: { title: string, clientOpId?: string }
 *
 * Idempotent: if the title is already equal, no-ops without an event.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { title?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  if (typeof payload.title !== 'string') {
    return NextResponse.json(
      { data: null, error: 'Invalid title' },
      { status: 400 },
    )
  }
  const title = payload.title.trim()
  if (!title) {
    return NextResponse.json(
      { data: null, error: 'Title cannot be empty' },
      { status: 400 },
    )
  }
  if (title.length > MAX_TITLE_LEN) {
    return NextResponse.json(
      { data: null, error: `Title too long (${MAX_TITLE_LEN} max)` },
      { status: 400 },
    )
  }

  const existing = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { title: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json(
      { data: null, error: 'Ticket not found' },
      { status: 404 },
    )
  }
  if (existing.title === title) {
    return NextResponse.json({ data: { ok: true, unchanged: true } })
  }

  await prisma.$transaction([
    prisma.tH_Ticket.update({
      where: { id: ticketId },
      data: { title },
    }),
    prisma.tH_TicketEvent.create({
      data: {
        ticketId,
        userId: session!.user.id,
        type: 'TITLE_CHANGE',
        data: { from: existing.title, to: title },
      },
    }),
  ])

  revalidatePath(`/tickets/${ticketId}`)
  return NextResponse.json({ data: { ok: true } })
}
