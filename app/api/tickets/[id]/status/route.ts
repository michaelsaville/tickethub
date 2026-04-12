import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { TH_TicketStatus } from '@prisma/client'
import { requireAuth } from '@/app/lib/api-auth'
import { updateTicketStatusCore } from '@/app/lib/tickets-core'

const VALID_STATUSES = new Set<TH_TicketStatus>([
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
])

/**
 * PATCH /api/tickets/[id]/status — used by the offline sync queue (and
 * the inline TicketProperties dropdown) to update ticket status.
 *
 * Body: { status: TH_TicketStatus, clientOpId?: string }
 *
 * Naturally idempotent — if the ticket is already in the target status,
 * `updateTicketStatusCore` no-ops without creating a duplicate event.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { status?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  if (
    typeof payload.status !== 'string' ||
    !VALID_STATUSES.has(payload.status as TH_TicketStatus)
  ) {
    return NextResponse.json(
      { data: null, error: 'Invalid status' },
      { status: 400 },
    )
  }

  const res = await updateTicketStatusCore(
    session!.user.id,
    ticketId,
    payload.status as TH_TicketStatus,
  )
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }

  revalidatePath(`/tickets/${ticketId}`)
  revalidatePath('/tickets')
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
