import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { deleteStoredFile, readStoredFile } from '@/app/lib/storage'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const att = await prisma.tH_Attachment.findUnique({
    where: { id },
    select: { filename: true, fileUrl: true, mimeType: true, sizeBytes: true },
  })
  if (!att) {
    return NextResponse.json(
      { data: null, error: 'Not found' },
      { status: 404 },
    )
  }

  try {
    const buf = await readStoredFile(att.fileUrl)
    const download = req.nextUrl.searchParams.get('download') === '1'
    const blob = new Blob([new Uint8Array(buf)], {
      type: att.mimeType || 'application/octet-stream',
    })
    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Length': String(att.sizeBytes),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${att.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (e) {
    console.error('[api/attachments] read failed', e)
    return NextResponse.json(
      { data: null, error: 'File missing on disk' },
      { status: 410 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const att = await prisma.tH_Attachment.findUnique({
    where: { id },
    select: { id: true, ticketId: true, fileUrl: true, filename: true },
  })
  if (!att) {
    return NextResponse.json(
      { data: null, error: 'Not found' },
      { status: 404 },
    )
  }

  await prisma.tH_Attachment.delete({ where: { id } })
  await deleteStoredFile(att.fileUrl)

  return NextResponse.json({ data: { id }, error: null })
}
