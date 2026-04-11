import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { storeTicketAttachment } from '@/app/lib/storage'

const MAX_SIZE = 25 * 1024 * 1024 // 25 MB

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
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { data: null, error: `File exceeds ${MAX_SIZE / 1024 / 1024} MB limit` },
      { status: 413 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const { relativePath, filename } = await storeTicketAttachment(
    ticketId,
    buffer,
    file.name || 'upload.bin',
  )

  const attachment = await prisma.tH_Attachment.create({
    data: {
      ticketId,
      uploadedById: session!.user.id,
      filename,
      fileUrl: relativePath,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: buffer.length,
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
