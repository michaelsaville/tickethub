import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { assignTicket } from '@/app/lib/actions/tickets'

/**
 * PATCH /api/tickets/[id]/assignee — offline-safe assignee update.
 * Body: { assignedToId: string | null }
 * Naturally idempotent: `assignTicket` no-ops if already set.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { assignedToId?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const assignedToId =
    payload.assignedToId === null
      ? null
      : typeof payload.assignedToId === 'string' && payload.assignedToId
        ? payload.assignedToId
        : null

  const res = await assignTicket(ticketId, assignedToId)
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
