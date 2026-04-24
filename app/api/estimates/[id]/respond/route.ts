import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

// POST /api/estimates/[id]/respond — customer approve/decline (portal token auth)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { action, token } = body

  if (!['approve', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Validate portal token
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 401 })
  }

  const portalToken = await prisma.tH_ContactPortalToken.findUnique({
    where: { token },
    include: { contact: { select: { clientId: true } } },
  })

  if (!portalToken || (portalToken.expiresAt && portalToken.expiresAt < new Date())) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    select: { status: true, clientId: true },
  })

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.clientId !== portalToken.contact.clientId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (estimate.status !== 'SENT') {
    return NextResponse.json({ error: 'Estimate is not pending response' }, { status: 400 })
  }

  if (action === 'approve') {
    await prisma.tH_Estimate.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    })
  } else {
    await prisma.tH_Estimate.update({
      where: { id },
      data: { status: 'DECLINED', declinedAt: new Date() },
    })
  }

  // Auto-acknowledge any associated reminder
  await prisma.tH_Reminder.updateMany({
    where: { source: 'TICKETHUB_ESTIMATE', externalRef: id, status: 'ACTIVE' },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  }).catch(() => {})

  await emit({
    type:
      action === 'approve'
        ? EVENT_TYPES.ESTIMATE_APPROVED
        : EVENT_TYPES.ESTIMATE_DECLINED,
    entityType: 'estimate',
    entityId: id,
    actorId: null,
    payload: {
      clientId: estimate.clientId,
      viaPortal: true,
      contactId: portalToken.contact.clientId ? portalToken.contactId : null,
    },
  })

  return NextResponse.json({ success: true, status: action === 'approve' ? 'APPROVED' : 'DECLINED' })
}

// GET /api/estimates/[id]/respond — check estimate status (for portal page)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 })

  const portalToken = await prisma.tH_ContactPortalToken.findUnique({
    where: { token },
    include: { contact: { select: { clientId: true, firstName: true, lastName: true } } },
  })

  if (!portalToken || (portalToken.expiresAt && portalToken.expiresAt < new Date())) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { name: true } },
      items: {
        include: { item: { select: { name: true, type: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!estimate || estimate.clientId !== portalToken.contact.clientId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    estimateNumber: estimate.estimateNumber,
    title: estimate.title,
    description: estimate.description,
    status: estimate.status,
    clientName: estimate.client.name,
    contactName: `${portalToken.contact.firstName} ${portalToken.contact.lastName}`,
    subtotal: estimate.subtotal,
    taxAmount: estimate.taxAmount,
    totalAmount: estimate.totalAmount,
    validUntil: estimate.validUntil,
    notes: estimate.notes,
    items: estimate.items.map(i => ({
      name: i.item.name,
      type: i.item.type,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })),
  })
}
