import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

// Long enough to fit a thorough write-up of the issue without being
// abusable. Adjust if a real ticket ever needs more — Postgres TEXT
// has no inherent cap.
const MAX_DESCRIPTION_LEN = 10_000

/**
 * PATCH /api/tickets/[id]/description — inline edit from the ticket
 * detail page. Empty string is allowed and clears the description.
 *
 * Logs a DESCRIPTION_CHANGE event to the timeline. To keep the event
 * payload bounded, we record only the lengths and a short head/tail
 * preview rather than the full prose — the actual content lives in
 * ticket.description.
 *
 * Body: { description: string | null }
 *
 * Idempotent: if the value is unchanged, no-ops without an event.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { description?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  let description: string | null
  if (payload.description === null || payload.description === undefined) {
    description = null
  } else if (typeof payload.description === 'string') {
    const trimmed = payload.description.trim()
    description = trimmed === '' ? null : trimmed
  } else {
    return NextResponse.json(
      { data: null, error: 'Invalid description' },
      { status: 400 },
    )
  }

  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return NextResponse.json(
      { data: null, error: `Description too long (${MAX_DESCRIPTION_LEN} max)` },
      { status: 400 },
    )
  }

  const existing = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { description: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json(
      { data: null, error: 'Ticket not found' },
      { status: 404 },
    )
  }
  if ((existing.description ?? null) === description) {
    return NextResponse.json({ data: { ok: true, unchanged: true } })
  }

  // Trim previews so the event row stays small even on a 10k-char swap.
  const preview = (s: string | null) =>
    s == null
      ? null
      : s.length <= 120
        ? s
        : s.slice(0, 60) + '…' + s.slice(-40)

  await prisma.$transaction([
    prisma.tH_Ticket.update({
      where: { id: ticketId },
      data: { description },
    }),
    prisma.tH_TicketEvent.create({
      data: {
        ticketId,
        userId: session!.user.id,
        type: 'DESCRIPTION_CHANGE',
        data: {
          fromLen: existing.description?.length ?? 0,
          toLen: description?.length ?? 0,
          fromPreview: preview(existing.description),
          toPreview: preview(description),
        },
      },
    }),
  ])

  revalidatePath(`/tickets/${ticketId}`)
  return NextResponse.json({ data: { ok: true } })
}
