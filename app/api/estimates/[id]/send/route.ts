import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { sendEstimateEmail } from '@/app/lib/actions/estimates'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

// POST /api/estimates/[id]/send — send estimate to client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
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

  // Create reminder for the contact (if any)
  if (estimate.contactId) {
    await prisma.tH_Reminder.upsert({
      where: { source_externalRef: { source: 'TICKETHUB_ESTIMATE', externalRef: id } },
      create: {
        contactId: estimate.contactId,
        source: 'TICKETHUB_ESTIMATE',
        externalRef: id,
        title: `Estimate awaiting approval: ${estimate.title}`,
        body: `Estimate #${estimate.estimateNumber} for ${estimate.client.name} — ${estimate.totalAmount ? `$${(estimate.totalAmount / 100).toFixed(2)}` : ''}`,
        actionUrl: `https://tickethub.pcc2k.com/estimates/${id}`,
        recurrence: 'EVERY_3_DAYS',
        nextNotifyAt: new Date(Date.now() + 3 * 86400000), // first reminder in 3 days (email already sent now)
      },
      update: {
        status: 'ACTIVE',
        nextNotifyAt: new Date(Date.now() + 3 * 86400000),
      },
    }).catch(() => {}) // non-critical
  }

  // Send email (fire and forget)
  await sendEstimateEmail(estimate).catch(e => console.error('Estimate email failed:', e))

  await emit({
    type: EVENT_TYPES.ESTIMATE_SENT,
    entityType: 'estimate',
    entityId: id,
    actorId: session?.user?.id,
    payload: {
      clientId: estimate.clientId,
      contactId: estimate.contactId,
      totalAmount: estimate.totalAmount,
    },
  })

  return NextResponse.json({ success: true })
}
