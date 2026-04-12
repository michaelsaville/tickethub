import { NextResponse, type NextRequest } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { createSignature } from '@/app/lib/actions/signatures'

/**
 * POST /api/tickets/[id]/signatures — offline-safe signature capture.
 *
 * Body: {
 *   signedByName: string
 *   dataUrl: string            // "data:image/png;base64,..."
 *   gpsLat?: number
 *   gpsLng?: number
 *   clientOpId: string         // idempotency key
 * }
 *
 * `createSignature` short-circuits on duplicate clientOpId via the
 * unique index on TH_Signature.clientOpId, so replays are safe.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  let payload: {
    signedByName?: unknown
    dataUrl?: unknown
    gpsLat?: unknown
    gpsLng?: unknown
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

  const signedByName =
    typeof payload.signedByName === 'string' ? payload.signedByName : ''
  const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : ''
  const clientOpId =
    typeof payload.clientOpId === 'string' ? payload.clientOpId : ''
  if (!signedByName || !dataUrl || !clientOpId) {
    return NextResponse.json(
      { data: null, error: 'signedByName, dataUrl, clientOpId required' },
      { status: 400 },
    )
  }

  const gpsLat =
    typeof payload.gpsLat === 'number' ? payload.gpsLat : undefined
  const gpsLng =
    typeof payload.gpsLng === 'number' ? payload.gpsLng : undefined

  const res = await createSignature(ticketId, {
    signedByName,
    dataUrl,
    gpsLat,
    gpsLng,
    clientOpId,
    overrideUserId: session!.user.id,
  })
  if (!res.ok) {
    return NextResponse.json(
      { data: null, error: res.error ?? 'Failed' },
      { status: 400 },
    )
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 201 })
}
