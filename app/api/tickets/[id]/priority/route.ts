import { NextResponse, type NextRequest } from 'next/server'
import type { TH_TicketPriority } from '@prisma/client'
import { requireAuth } from '@/app/lib/api-auth'
import { updateTicketPriority } from '@/app/lib/actions/tickets'

const VALID = new Set<TH_TicketPriority>(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])

/**
 * PATCH /api/tickets/[id]/priority — offline-safe priority update.
 * Naturally idempotent: `updateTicketPriority` no-ops if already set.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: { priority?: unknown }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(
      { data: null, error: 'Expected JSON body' },
      { status: 400 },
    )
  }

  if (
    typeof payload.priority !== 'string' ||
    !VALID.has(payload.priority as TH_TicketPriority)
  ) {
    return NextResponse.json(
      { data: null, error: 'Invalid priority' },
      { status: 400 },
    )
  }

  const res = await updateTicketPriority(
    ticketId,
    payload.priority as TH_TicketPriority,
  )
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 200 })
}
