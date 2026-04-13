import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { sendEstimateEmail } from '@/app/lib/actions/estimates'

// POST /api/estimates/[id]/send — send estimate to client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, billingEmail: true } },
      contact: { select: { firstName: true, lastName: true, email: true } },
      items: { include: { item: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Can only send DRAFT estimates' }, { status: 400 })
  }
  if (estimate.items.length === 0) {
    return NextResponse.json({ error: 'Estimate has no line items' }, { status: 400 })
  }

  // Update status to SENT
  await prisma.tH_Estimate.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date() },
  })

  // Send email (fire and forget)
  await sendEstimateEmail(estimate).catch(e => console.error('Estimate email failed:', e))

  return NextResponse.json({ success: true })
}
