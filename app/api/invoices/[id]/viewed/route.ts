import type { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'

// Force node runtime — we need Buffer + prisma
export const runtime = 'nodejs'
// Never cache the pixel response
export const dynamic = 'force-dynamic'

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Anonymous endpoint — no requireAuth. This is a tracking pixel
  // embedded in the outgoing invoice email, so the client viewing the
  // email has no session. The only side effect is a read + update on
  // the named invoice. We silently ignore unknown IDs so a scanner
  // can't enumerate.
  try {
    const invoice = await prisma.tH_Invoice.findUnique({
      where: { id },
      select: { id: true, firstViewedAt: true, status: true },
    })
    if (invoice) {
      const shouldTransitionToViewed =
        !invoice.firstViewedAt && invoice.status === 'SENT'
      await prisma.tH_Invoice.update({
        where: { id },
        data: {
          firstViewedAt: invoice.firstViewedAt ?? new Date(),
          viewCount: { increment: 1 },
          ...(shouldTransitionToViewed ? { status: 'VIEWED' as const } : {}),
        },
      })
    }
  } catch (e) {
    // Never break the email — just log
    console.error('[api/invoices/viewed]', e)
  }

  return new Response(new Blob([new Uint8Array(TRANSPARENT_GIF)], { type: 'image/gif' }), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}
