import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { updateTicketContract } from '@/app/lib/actions/tickets'

/**
 * PATCH /api/tickets/[id]/contract — offline-safe contract update.
 * Body: { contractId: string | null }
 * Naturally idempotent: `updateTicketContract` no-ops if already set.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { contractId?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  const contractId =
    payload.contractId === null
      ? null
      : typeof payload.contractId === 'string' && payload.contractId
        ? payload.contractId
        : null

  const res = await updateTicketContract(ticketId, contractId)
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
