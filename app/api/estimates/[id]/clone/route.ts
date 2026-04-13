import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { rateForStateAsync } from '@/app/lib/tax-server'
import { computeTax } from '@/app/lib/tax'

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
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!estimate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Resolve tax rate from client's billing state
  const client = await prisma.tH_Client.findUnique({
    where: { id: estimate.clientId },
    select: { billingState: true },
  })
  const taxRate = await rateForStateAsync(client?.billingState)

  // Build cloned items and recalculate totals
  let subtotal = 0
  let taxableSubtotal = 0
  const clonedItems: { itemId: string; description: string | null; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }[] = []

  for (const item of estimate.items) {
    const catalogItem = await prisma.tH_Item.findUnique({
      where: { id: item.itemId },
      select: { taxable: true },
    })

    clonedItems.push({
      itemId: item.itemId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      sortOrder: item.sortOrder,
    })

    subtotal += item.totalPrice
    if (catalogItem?.taxable) taxableSubtotal += item.totalPrice
  }

  const taxAmount = computeTax(taxableSubtotal, taxRate)
  const totalAmount = subtotal + taxAmount

  const validUntil = new Date(Date.now() + 30 * 86400000)

  const newEstimate = await prisma.tH_Estimate.create({
    data: {
      clientId: estimate.clientId,
      contactId: estimate.contactId,
      contractId: estimate.contractId,
      title: `Copy of ${estimate.title}`,
      description: estimate.description,
      notes: estimate.notes,
      validUntil,
      subtotal,
      taxableSubtotal,
      taxState: client?.billingState || null,
      taxRate,
      taxAmount,
      totalAmount,
      items: { create: clonedItems },
    },
  })

  return NextResponse.json({ id: newEstimate.id })
}
