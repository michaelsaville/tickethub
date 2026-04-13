import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

/**
 * POST /api/tickets/:id/parts
 * REST endpoint for the Amazon Business browser extension.
 * Accepts cents directly (not dollar strings) for programmatic use.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: ticketId } = await params
  const userId = session!.user.id

  const body = await req.json()
  const {
    name,
    asin,
    vendor,
    vendorUrl,
    imageUrl,
    quantity = 1,
    unitCost = 0,
    unitPrice = 0,
    orderNumber,
  } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  })
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const part = await prisma.tH_TicketPart.create({
    data: {
      ticketId,
      addedById: userId,
      name: name.trim(),
      asin: asin || null,
      vendor: vendor || 'Amazon Business',
      vendorUrl: vendorUrl || null,
      imageUrl: imageUrl || null,
      quantity: Math.max(1, Math.floor(Number(quantity))),
      unitCost: Math.round(Number(unitCost)),
      unitPrice: Math.round(Number(unitPrice)),
      orderNumber: orderNumber || null,
      status: 'PENDING_ORDER',
    },
  })

  return NextResponse.json({ data: { id: part.id } }, { status: 201 })
}
