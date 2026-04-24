import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { rateForStateAsync } from '@/app/lib/tax-server'
import { computeTax } from '@/app/lib/tax'
import { emit } from '@/app/lib/automation/bus'
import { EVENT_TYPES } from '@/app/lib/automation/events'

// GET /api/estimates — list all estimates (optionally filter by clientId)
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')

  const estimates = await prisma.tH_Estimate.findMany({
    where: clientId ? { clientId } : undefined,
    include: {
      client: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(estimates)
}

// POST /api/estimates — create a new estimate
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const { clientId, contactId, contractId, title, description, validUntil, notes, items } = body

  if (!clientId || !title?.trim()) {
    return NextResponse.json({ error: 'Client and title required' }, { status: 400 })
  }

  // Resolve tax rate from client's billing state
  const client = await prisma.tH_Client.findUnique({
    where: { id: clientId },
    select: { billingState: true },
  })
  const taxRate = await rateForStateAsync(client?.billingState)

  // Build estimate items
  const estimateItems: { itemId: string; description?: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }[] = []
  let subtotal = 0
  let taxableSubtotal = 0

  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const catalogItem = await prisma.tH_Item.findUnique({
        where: { id: item.itemId },
        select: { defaultPrice: true, taxable: true },
      })
      if (!catalogItem) continue

      const unitPrice = item.unitPrice ?? catalogItem.defaultPrice
      const quantity = item.quantity ?? 1
      const totalPrice = Math.round(unitPrice * quantity)

      estimateItems.push({
        itemId: item.itemId,
        description: item.description?.trim() || null,
        quantity,
        unitPrice,
        totalPrice,
        sortOrder: i,
      })

      subtotal += totalPrice
      if (catalogItem.taxable) taxableSubtotal += totalPrice
    }
  }

  const taxAmount = computeTax(taxableSubtotal, taxRate)
  const totalAmount = subtotal + taxAmount

  const estimate = await prisma.tH_Estimate.create({
    data: {
      clientId,
      contactId: contactId || null,
      contractId: contractId || null,
      title: title.trim(),
      description: description?.trim() || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      notes: notes?.trim() || null,
      subtotal,
      taxableSubtotal,
      taxState: client?.billingState || null,
      taxRate,
      taxAmount,
      totalAmount,
      items: {
        create: estimateItems,
      },
    },
    include: {
      client: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { item: { select: { id: true, name: true, type: true } } }, orderBy: { sortOrder: 'asc' } },
    },
  })

  await emit({
    type: EVENT_TYPES.ESTIMATE_CREATED,
    entityType: 'estimate',
    entityId: estimate.id,
    actorId: session?.user?.id,
    payload: {
      clientId,
      contactId: contactId || null,
      contractId: contractId || null,
      totalAmount: estimate.totalAmount,
      itemCount: estimate.items.length,
    },
  })

  return NextResponse.json(estimate, { status: 201 })
}
