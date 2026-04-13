import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

// POST /api/estimates/[id]/convert — convert approved estimate to invoice
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth('TICKETHUB_ADMIN')
  if (error) return error
  const { id } = await params

  const estimate = await prisma.tH_Estimate.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, billingState: true } },
      items: { include: { item: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (estimate.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Can only convert APPROVED estimates' }, { status: 400 })
  }

  // Find or use the global contract
  const contractId = estimate.contractId || (await prisma.tH_Contract.findFirst({
    where: { clientId: estimate.clientId, isGlobal: true },
    select: { id: true },
  }))?.id

  if (!contractId) {
    return NextResponse.json({ error: 'No contract found for client' }, { status: 400 })
  }

  // Create charges from estimate items
  const chargeIds: string[] = []
  for (const item of estimate.items) {
    const charge = await prisma.tH_Charge.create({
      data: {
        contractId,
        itemId: item.itemId,
        type: item.item.type as any,
        status: 'BILLABLE',
        description: item.description || item.item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        workDate: new Date(),
      },
    })
    chargeIds.push(charge.id)
  }

  // Create invoice from those charges
  const invoice = await prisma.tH_Invoice.create({
    data: {
      clientId: estimate.clientId,
      contractId: estimate.contractId,
      status: 'DRAFT',
      subtotal: estimate.subtotal,
      taxableSubtotal: estimate.taxableSubtotal,
      taxState: estimate.taxState,
      taxRate: estimate.taxRate,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      notes: `Converted from Estimate #${estimate.estimateNumber}`,
      charges: {
        connect: chargeIds.map(id => ({ id })),
      },
    },
  })

  // Update charges to INVOICED
  await prisma.tH_Charge.updateMany({
    where: { id: { in: chargeIds } },
    data: { status: 'INVOICED', invoiceId: invoice.id },
  })

  // Mark estimate as converted
  await prisma.tH_Estimate.update({
    where: { id },
    data: {
      status: 'CONVERTED',
      convertedToInvoiceId: invoice.id,
      convertedAt: new Date(),
    },
  })

  return NextResponse.json({ success: true, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber })
}
