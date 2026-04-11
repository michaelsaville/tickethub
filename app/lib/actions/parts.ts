'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_PartStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { parseCents } from '@/app/lib/billing'

export type PartResult = { ok: true } | { ok: false; error: string }

async function getUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export interface CreatePartInput {
  name: string
  quantity: number
  unitCostDollars: string
  unitPriceDollars: string
  vendor?: string
  vendorUrl?: string
  asin?: string
  orderNumber?: string
}

export async function createTicketPart(
  ticketId: string,
  input: CreatePartInput,
): Promise<PartResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Part name is required' }
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 0))
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Quantity must be positive' }
  }
  const unitCost = parseCents(input.unitCostDollars ?? '')
  const unitPrice = parseCents(input.unitPriceDollars ?? '')
  if (unitPrice < 0 || unitCost < 0) {
    return { ok: false, error: 'Prices must be non-negative' }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.tH_TicketPart.create({
        data: {
          ticketId,
          addedById: userId,
          name,
          quantity,
          unitCost,
          unitPrice,
          vendor: input.vendor?.trim() || 'Amazon Business',
          vendorUrl: input.vendorUrl?.trim() || null,
          asin: input.asin?.trim() || null,
          orderNumber: input.orderNumber?.trim() || null,
          status: 'PENDING_ORDER',
        },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'PART_ADDED',
          data: { name, quantity },
        },
      })
    })
    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/parts] create failed', e)
    return { ok: false, error: 'Failed to add part' }
  }
}

export async function updatePartStatus(
  partId: string,
  status: TH_PartStatus,
): Promise<PartResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const part = await prisma.tH_TicketPart.findUnique({
      where: { id: partId },
      select: { id: true, ticketId: true, status: true },
    })
    if (!part) return { ok: false, error: 'Not found' }
    if (part.status === status) return { ok: true }
    await prisma.$transaction([
      prisma.tH_TicketPart.update({
        where: { id: partId },
        data: { status },
      }),
      prisma.tH_TicketEvent.create({
        data: {
          ticketId: part.ticketId,
          userId,
          type: 'PART_STATUS_CHANGE',
          data: { partId, from: part.status, to: status },
        },
      }),
    ])
    revalidatePath(`/tickets/${part.ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/parts] updateStatus failed', e)
    return { ok: false, error: 'Failed to update status' }
  }
}

export async function deletePart(partId: string): Promise<PartResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }
  try {
    const part = await prisma.tH_TicketPart.findUnique({
      where: { id: partId },
      select: { id: true, ticketId: true, chargeId: true },
    })
    if (!part) return { ok: false, error: 'Not found' }
    if (part.chargeId) {
      return {
        ok: false,
        error: 'Part has been converted to a charge — remove the charge first',
      }
    }
    await prisma.tH_TicketPart.delete({ where: { id: partId } })
    revalidatePath(`/tickets/${part.ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/parts] delete failed', e)
    return { ok: false, error: 'Failed to delete part' }
  }
}

/**
 * Convert a part to a BILLABLE charge. Uses the part's unitPrice directly
 * (bypassing the cascade) since parts carry their own vendor price. The
 * caller picks a PART-type catalog item for chart-of-accounts mapping.
 */
export async function convertPartToCharge(
  partId: string,
  itemId: string,
): Promise<PartResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  try {
    const part = await prisma.tH_TicketPart.findUnique({
      where: { id: partId },
      include: { ticket: { select: { id: true, contractId: true, clientId: true } } },
    })
    if (!part) return { ok: false, error: 'Not found' }
    if (part.chargeId) return { ok: false, error: 'Already converted' }

    const item = await prisma.tH_Item.findUnique({
      where: { id: itemId },
      select: { id: true, type: true, isActive: true },
    })
    if (!item || !item.isActive) {
      return { ok: false, error: 'Item not found or inactive' }
    }

    // Resolve the contract — fall back to Global Contract if the ticket has none
    let contractId = part.ticket.contractId
    if (!contractId) {
      const global = await prisma.tH_Contract.findFirst({
        where: { clientId: part.ticket.clientId, isGlobal: true },
        select: { id: true },
      })
      if (!global) {
        return { ok: false, error: 'No contract on ticket and no Global Contract' }
      }
      contractId = global.id
    }

    const description = [
      part.name,
      part.orderNumber ? `Order ${part.orderNumber}` : null,
      part.vendor ? `via ${part.vendor}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    await prisma.$transaction(async (tx) => {
      const charge = await tx.tH_Charge.create({
        data: {
          ticketId: part.ticketId,
          contractId,
          itemId: item.id,
          technicianId: userId,
          type: 'PART',
          status: 'BILLABLE',
          description,
          quantity: part.quantity,
          unitPrice: part.unitPrice,
          totalPrice: part.unitPrice * part.quantity,
        },
      })
      await tx.tH_TicketPart.update({
        where: { id: partId },
        data: { chargeId: charge.id },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId: part.ticketId,
          userId,
          type: 'PART_CONVERTED',
          data: { partId, chargeId: charge.id, name: part.name },
        },
      })
    })

    revalidatePath(`/tickets/${part.ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/parts] convertToCharge failed', e)
    return { ok: false, error: 'Failed to convert to charge' }
  }
}
