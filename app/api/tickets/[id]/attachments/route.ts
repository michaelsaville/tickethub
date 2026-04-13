import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { storeTicketAttachment } from '@/app/lib/storage'

const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

/**
 * POST /api/tickets/[id]/attachments
 *
 * Accepts either multipart/form-data (legacy Upload button path) or
 * JSON `{ filename, mimeType, base64, clientOpId }` — the JSON branch is
 * what the offline sync queue uses, since it can only serialize JSON
 * bodies to IndexedDB. Replays are idempotent via the unique index on
 * TH_Attachment.clientOpId.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  })
  if (!ticket) {
    return NextResponse.json(
      { data: null, error: 'Ticket not found' },
      { status: 404 },
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  let buffer: Buffer
  let originalName: string
  let mimeType: string
  let clientOpId: string | null = null
  let gpsLat: number | null = null
  let gpsLng: number | null = null

  if (isJson) {
    let payload: {
      filename?: unknown
      mimeType?: unknown
      base64?: unknown
      clientOpId?: unknown
      gpsLat?: unknown
      gpsLng?: unknown
    }
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json(
        { data: null, error: 'Expected JSON body' },
        { status: 400 },
      )
    }
    const filename =
      typeof payload.filename === 'string' ? payload.filename : ''
    const base64 = typeof payload.base64 === 'string' ? payload.base64 : ''
    clientOpId =
      typeof payload.clientOpId === 'string' ? payload.clientOpId : null
    if (!filename || !base64 || !clientOpId) {
      return NextResponse.json(
        { data: null, error: 'filename, base64, clientOpId required' },
        { status: 400 },
      )
    }
    // Replay short-circuit — if a prior attempt already landed, return
    // the existing row so the client-side optimistic layer can settle.
    const existing = await prisma.tH_Attachment.findUnique({
      where: { clientOpId },
    })
    if (existing) {
      return NextResponse.json(
        { data: existing, error: null },
        { status: 200 },
      )
    }
    originalName = filename
    mimeType =
      typeof payload.mimeType === 'string'
        ? payload.mimeType
        : 'application/octet-stream'
    if (typeof payload.gpsLat === 'number' && Number.isFinite(payload.gpsLat)) gpsLat = payload.gpsLat
    if (typeof payload.gpsLng === 'number' && Number.isFinite(payload.gpsLng)) gpsLng = payload.gpsLng

    try {
      buffer = Buffer.from(base64, 'base64')
    } catch {
      return NextResponse.json(
        { data: null, error: 'Invalid base64 payload' },
        { status: 400 },
      )
    }
  } else {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json(
        { data: null, error: 'Expected multipart/form-data' },
        { status: 400 },
      )
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { data: null, error: 'No file provided' },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json(
        { data: null, error: 'File is empty' },
        { status: 400 },
      )
    }
    buffer = Buffer.from(await file.arrayBuffer())
    originalName = file.name || 'upload.bin'
    mimeType = file.type || 'application/octet-stream'

    const latStr = form.get('gpsLat')
    const lngStr = form.get('gpsLng')
    if (latStr && !isNaN(Number(latStr))) gpsLat = Number(latStr)
    if (lngStr && !isNaN(Number(lngStr))) gpsLng = Number(lngStr)
  }

  if (buffer.length === 0) {
    return NextResponse.json(
      { data: null, error: 'File is empty' },
      { status: 400 },
    )
  }
  if (buffer.length > MAX_SIZE) {
    return NextResponse.json(
      { data: null, error: `File exceeds ${MAX_SIZE / 1024 / 1024} MB limit` },
      { status: 413 },
    )
  }

  const { relativePath, filename } = await storeTicketAttachment(
    ticketId,
    buffer,
    originalName,
  )

  const attachment = await prisma.tH_Attachment.create({
    data: {
      ticketId,
      uploadedById: session!.user.id,
      filename,
      fileUrl: relativePath,
      mimeType,
      sizeBytes: buffer.length,
      clientOpId,
      gpsLat,
      gpsLng,
    },
  })

  await prisma.tH_TicketEvent.create({
    data: {
      ticketId,
      userId: session!.user.id,
      type: 'ATTACHMENT_ADDED',
      data: { filename, sizeBytes: buffer.length },
    },
  })

  return NextResponse.json({ data: attachment, error: null }, { status: 201 })
}
