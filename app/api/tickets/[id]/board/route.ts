import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { updateTicketBoard } from '@/app/lib/actions/tickets'

/**
 * PATCH /api/tickets/[id]/board — offline-safe board update.
 * Idempotent: `updateTicketBoard` no-ops when the value is unchanged.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { board?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  let board: string | null
  if (payload.board === null || payload.board === undefined || payload.board === '') {
    board = null
  } else if (typeof payload.board === 'string') {
    board = payload.board
  } else {
    return NextResponse.json(
      { data: null, error: 'board must be a string or null' },
      { status: 400 },
    )
  }

  const res = await updateTicketBoard(ticketId, board)
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
