import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { createCharge } from '@/app/lib/actions/charges'

/**
 * POST /api/timer/stop — offline-safe variant of `stopTimerAndCharge`.
 *
 * Body: {
 *   itemId: string
 *   durationMinutes: number   // computed client-side at stop time
 *   description?: string
 *   ticketId: string          // the ticket the timer was running on
 *   clientOpId: string        // idempotency key — required for replays
 * }
 *
 * Why client-computed duration? When a tech stops a timer offline, the
 * queued op might not reach the server for hours. Recomputing from the
 * server-side `startedAt` would inflate the charge by the entire offline
 * gap. The client captures elapsed at the moment of the stop click and
 * sends it along — the server trusts it.
 *
 * Idempotency: `createCharge` short-circuits on duplicate clientOpId, and
 * the timer-delete is a no-op if the timer was already cleared by a prior
 * replay.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  let payload: {
    itemId?: unknown
    durationMinutes?: unknown
    description?: unknown
    ticketId?: unknown
    clientOpId?: unknown
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const itemId = typeof payload.itemId === 'string' ? payload.itemId : ''
  const ticketId =
    typeof payload.ticketId === 'string' ? payload.ticketId : ''
  const clientOpId =
    typeof payload.clientOpId === 'string' ? payload.clientOpId : ''
  const durationMinutes = Number(payload.durationMinutes)
  const description =
    typeof payload.description === 'string' ? payload.description : undefined

  if (!itemId || !ticketId || !clientOpId) {
    return NextResponse.json(
      { data: null, error: 'itemId, ticketId, clientOpId required' },
      { status: 400 },
    )
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json(
      { data: null, error: 'durationMinutes must be positive' },
      { status: 400 },
    )
  }

  const userId = session!.user.id

  const chargeRes = await createCharge(ticketId, {
    itemId,
    durationMinutes,
    description: description ?? null,
    clientOpId,
    overrideUserId: userId,
  })
  if (!chargeRes.ok) {
    return NextResponse.json(
      { data: null, error: chargeRes.error ?? 'Failed' },
      { status: 400 },
    )
  }

  // Clear the timer. Safe on replays — if it's already gone, deleteMany
  // is a no-op. We scope to (userId + ticketId) so we don't accidentally
  // clear a later timer the user started on a different ticket.
  await prisma.tH_TicketTimer.deleteMany({ where: { userId, ticketId } })

  revalidatePath(`/tickets/${ticketId}`)
  revalidatePath('/', 'layout')
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
