import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export const runtime = 'nodejs'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/uploads'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const sig = await prisma.tH_Signature.findUnique({
    where: { id },
    select: { signatureUrl: true },
  })
  if (!sig) {
    return NextResponse.json(
      { data: null, error: 'Not found' },
      { status: 404 },
    )
  }

  try {
    const abs = path.resolve(UPLOADS_DIR, sig.signatureUrl)
    const root = path.resolve(UPLOADS_DIR)
    if (!abs.startsWith(root + path.sep)) {
      throw new Error('Path escapes uploads dir')
    }
    const buf = await fs.readFile(abs)
    return new NextResponse(
      new Blob([new Uint8Array(buf)], { type: 'image/png' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600',
        },
      },
    )
  } catch (e) {
    console.error('[api/signatures] read failed', e)
    return NextResponse.json(
      { data: null, error: 'File missing' },
      { status: 410 },
    )
  }
}
