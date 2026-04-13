import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { rateForStateAsync } from '@/app/lib/tax-server'
import { computeTax } from '@/app/lib/tax'

// GET /api/estimates/[id] — estimate detail
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, billingEmail: true, billingState: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      contract: { select: { id: true, name: true, type: true } },
      items: {
        include: { item: { select: { id: true, name: true, type: true, code: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(estimate)
}

// PATCH /api/estimates/[id] — update estimate (DRAFT only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const estimate = await prisma.tH_Estimate.findUnique({ where: { id }, select: { status: true } })
  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Can only edit DRAFT estimates' }, { status: 400 })
  }

  const data: any = {}
  if (body.title !== undefined) data.title = body.title.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.contactId !== undefined) data.contactId = body.contactId || null
  if (body.contractId !== undefined) data.contractId = body.contractId || null
  if (body.validUntil !== undefined) data.validUntil = body.validUntil ? new Date(body.validUntil) : null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null

  // If items array is provided, rebuild all line items and recalculate totals
  if (Array.isArray(body.items)) {
    // Load client for tax calculation
    const fullEstimate = await prisma.tH_Estimate.findUnique({
      where: { id },
      select: { clientId: true },
    })
    const client = await prisma.tH_Client.findUnique({
      where: { id: fullEstimate!.clientId },
      select: { billingState: true },
    })
    const taxRate = await rateForStateAsync(client?.billingState)

    // Build new items
    let subtotal = 0
    let taxableSubtotal = 0
    const newItems: { itemId: string; description: string | null; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }[] = []

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      const catalogItem = await prisma.tH_Item.findUnique({
        where: { id: item.itemId },
        select: { defaultPrice: true, taxable: true },
      })
      if (!catalogItem) continue

      const unitPrice = item.unitPrice ?? catalogItem.defaultPrice
      const quantity = item.quantity ?? 1
      const totalPrice = Math.round(unitPrice * quantity)

      newItems.push({
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

    const taxAmount = computeTax(taxableSubtotal, taxRate)
    const totalAmount = subtotal + taxAmount

    // Delete existing items and recreate in a transaction
    await prisma.$transaction([
      prisma.tH_EstimateItem.deleteMany({ where: { estimateId: id } }),
      prisma.tH_Estimate.update({
        where: { id },
        data: {
          ...data,
          subtotal,
          taxableSubtotal,
          taxState: client?.billingState || null,
          taxRate,
          taxAmount,
          totalAmount,
          items: { create: newItems },
        },
      }),
    ])

    const updated = await prisma.tH_Estimate.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        items: { include: { item: true }, orderBy: { sortOrder: 'asc' } },
      },
    })

    return NextResponse.json(updated)
  }

  const updated = await prisma.tH_Estimate.update({
    where: { id },
    data,
    include: {
      client: { select: { id: true, name: true } },
      items: { include: { item: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/estimates/[id] — delete estimate (DRAFT only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({ where: { id }, select: { status: true } })
  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Can only delete DRAFT estimates' }, { status: 400 })
  }

  await prisma.tH_Estimate.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
