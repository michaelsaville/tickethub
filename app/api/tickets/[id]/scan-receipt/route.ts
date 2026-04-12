import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { storeTicketAttachment } from '@/app/lib/storage'
import { scanReceipt } from '@/app/lib/ai-receipt'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB — vision API doesn't need more

/**
 * POST /api/tickets/[id]/scan-receipt
 *
 * Accepts either multipart/form-data (field: `file`) or JSON
 * `{ filename, mimeType, base64 }`. Saves the image as a ticket attachment
 * AND runs Claude vision to pull out vendor/date/total/line items. Returns
 * `{ attachment, scan }`. Charge creation is deliberately NOT done here —
 * the client shows the extracted fields for review and posts to the
 * existing /charges route with `unitPriceOverride` after the tech confirms.
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

  if (isJson) {
    let payload: {
      filename?: unknown
      mimeType?: unknown
      base64?: unknown
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
    if (!filename || !base64) {
      return NextResponse.json(
        { data: null, error: 'filename and base64 required' },
        { status: 400 },
      )
    }
    originalName = filename
    mimeType =
      typeof payload.mimeType === 'string'
        ? payload.mimeType
        : 'application/octet-stream'
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
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { data: null, error: 'No file provided' },
        { status: 400 },
      )
    }
    buffer = Buffer.from(await file.arrayBuffer())
    originalName = file.name || 'receipt.jpg'
    mimeType = file.type || 'image/jpeg'
  }

  if (buffer.length > MAX_SIZE) {
    return NextResponse.json(
      { data: null, error: `File exceeds ${MAX_SIZE / 1024 / 1024} MB limit` },
      { status: 413 },
    )
  }
  if (!mimeType.startsWith('image/')) {
    return NextResponse.json(
      { data: null, error: 'Receipt must be an image' },
      { status: 400 },
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
    },
  })
  await prisma.tH_TicketEvent.create({
    data: {
      ticketId,
      userId: session!.user.id,
      type: 'ATTACHMENT_ADDED',
      data: { filename, sizeBytes: buffer.length, source: 'receipt-scan' },
    },
  })

  let scan
  try {
    scan = await scanReceipt(buffer.toString('base64'), mimeType)
  } catch (e) {
    console.error('[scan-receipt] vision call failed', e)
    return NextResponse.json(
      {
        data: { attachment, scan: null },
        error: 'Receipt saved but scan failed — fill in the charge manually.',
      },
      { status: 200 },
    )
  }

  return NextResponse.json(
    { data: { attachment, scan }, error: null },
    { status: 201 },
  )
}
