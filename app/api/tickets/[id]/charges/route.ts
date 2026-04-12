import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/app/lib/api-auth'
import { createCharge } from '@/app/lib/actions/charges'

/**
 * POST /api/tickets/[id]/charges — offline-safe Quick Charge entrypoint.
 *
 * Body: {
 *   itemId: string
 *   durationMinutes?: number   // LABOR only
 *   chargedMinutes?: number    // LABOR only, billed override
 *   quantity?: number          // non-LABOR
 *   description?: string
 *   clientOpId: string         // idempotency key
 * }
 *
 * createCharge already short-circuits on duplicate clientOpId via the
 * unique index on TH_Charge.clientOpId, so replays are safe.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: {
    itemId?: unknown
    durationMinutes?: unknown
    chargedMinutes?: unknown
    quantity?: unknown
    description?: unknown
    clientOpId?: unknown
    unitPriceOverride?: unknown
    workDate?: unknown
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
  const clientOpId =
    typeof payload.clientOpId === 'string' ? payload.clientOpId : ''
  if (!itemId || !clientOpId) {
    return NextResponse.json(
      { data: null, error: 'itemId and clientOpId required' },
      { status: 400 },
    )
  }

  const durationMinutes =
    payload.durationMinutes != null ? Number(payload.durationMinutes) : undefined
  const chargedMinutes =
    payload.chargedMinutes != null ? Number(payload.chargedMinutes) : undefined
  const quantity =
    payload.quantity != null ? Number(payload.quantity) : undefined
  const description =
    typeof payload.description === 'string' ? payload.description : null
  const unitPriceOverride =
    payload.unitPriceOverride != null
      ? Number(payload.unitPriceOverride)
      : undefined
  let workDate: Date | undefined
  if (typeof payload.workDate === 'string') {
    const parsed = new Date(payload.workDate)
    if (!Number.isNaN(parsed.getTime())) workDate = parsed
  }

  const res = await createCharge(ticketId, {
    itemId,
    durationMinutes,
    chargedMinutes,
    quantity,
    description,
    clientOpId,
    unitPriceOverride,
    workDate,
    overrideUserId: session!.user.id,
  })
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }

  revalidatePath(`/tickets/${ticketId}`)
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 201 })
}
