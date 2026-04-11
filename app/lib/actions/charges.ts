'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import type { TH_ChargeStatus, TH_ChargeType } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { resolveUnitPrice } from '@/app/lib/billing'

export type ChargeResult = { ok: true } | { ok: false; error: string }

async function getUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

const ITEM_TYPE_TO_CHARGE_TYPE: Record<string, TH_ChargeType> = {
  LABOR: 'LABOR',
  PART: 'PART',
  EXPENSE: 'EXPENSE',
  CONTRACT_FEE: 'CONTRACT_FEE',
  LICENSE: 'EXPENSE',
}

export async function createCharge(
  ticketId: string,
  input: {
    itemId: string
    durationMinutes?: number
    quantity?: number
    description?: string | null
  },
): Promise<ChargeResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  try {
    const [ticket, item] = await Promise.all([
      prisma.tH_Ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          clientId: true,
          contractId: true,
          contract: { select: { id: true, type: true } },
          status: true,
        },
      }),
      prisma.tH_Item.findUnique({
        where: { id: input.itemId },
        select: { id: true, type: true, name: true, isActive: true },
      }),
    ])
    if (!ticket) return { ok: false, error: 'Ticket not found' }
    if (!item || !item.isActive) {
      return { ok: false, error: 'Item not found or inactive' }
    }

    // Every ticket should already have a contract (Global Contract falls back
    // on ticket creation), but older tickets might not — resolve on demand.
    let contractId = ticket.contractId
    if (!contractId) {
      const global = await prisma.tH_Contract.findFirst({
        where: { clientId: ticket.clientId, isGlobal: true },
        select: { id: true },
      })
      if (!global) {
        return { ok: false, error: 'No contract on ticket and no Global Contract' }
      }
      contractId = global.id
      await prisma.tH_Ticket.update({
        where: { id: ticketId },
        data: { contractId },
      })
    }

    const chargeType = ITEM_TYPE_TO_CHARGE_TYPE[item.type] ?? 'EXPENSE'

    // For LABOR, quantity is decimal hours derived from duration.
    // For others, quantity is integer unit count (defaults to 1).
    let quantity: number
    let timeSpentMinutes: number | null = null
    let timeChargedMinutes: number | null = null
    if (chargeType === 'LABOR') {
      const mins = Number(input.durationMinutes ?? 0)
      if (!Number.isFinite(mins) || mins <= 0) {
        return { ok: false, error: 'Labor duration required' }
      }
      quantity = mins / 60
      timeSpentMinutes = Math.round(mins)
      timeChargedMinutes = Math.round(mins)
    } else {
      const q = Number(input.quantity ?? 1)
      if (!Number.isFinite(q) || q <= 0) {
        return { ok: false, error: 'Quantity must be positive' }
      }
      quantity = q
    }

    const unitPrice = await resolveUnitPrice({
      itemId: item.id,
      contractId,
      technicianId: userId,
      chargeType,
    })
    const totalPrice = Math.round(quantity * unitPrice)

    // Look up the contract type — if we fell back to the Global Contract
    // above, ticket.contract.type is stale. Re-fetch by id.
    const resolvedContract =
      ticket.contract && ticket.contractId === contractId
        ? ticket.contract
        : await prisma.tH_Contract.findUnique({
            where: { id: contractId },
            select: { type: true },
          })

    await prisma.$transaction(async (tx) => {
      const charge = await tx.tH_Charge.create({
        data: {
          ticketId,
          contractId,
          itemId: item.id,
          technicianId: userId,
          type: chargeType,
          status: 'BILLABLE',
          description: input.description?.trim() || null,
          timeSpentMinutes,
          timeChargedMinutes,
          quantity,
          unitPrice,
          totalPrice,
        },
      })
      // Block-hours auto-increment: if a LABOR charge lands on a
      // BLOCK_HOURS contract, add the hours to contract.blockHoursUsed.
      if (
        chargeType === 'LABOR' &&
        resolvedContract?.type === 'BLOCK_HOURS'
      ) {
        await tx.tH_Contract.update({
          where: { id: contractId },
          data: { blockHoursUsed: { increment: quantity } },
        })
      }
      await tx.tH_TicketEvent.create({
        data: {
          ticketId,
          userId,
          type: 'CHARGE_ADDED',
          data: {
            chargeId: charge.id,
            chargeType,
            itemName: item.name,
            ...(timeChargedMinutes != null
              ? { minutes: timeChargedMinutes }
              : { quantity }),
          },
        },
      })
    })

    revalidatePath(`/tickets/${ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/charges] create failed', e)
    return { ok: false, error: 'Failed to add charge' }
  }
}

export async function updateChargeStatus(
  chargeId: string,
  status: TH_ChargeStatus,
): Promise<ChargeResult> {
  const userId = await getUserId()
  if (!userId) return { ok: false, error: 'Unauthorized' }

  try {
    const current = await prisma.tH_Charge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        status: true,
        ticketId: true,
        contractId: true,
        type: true,
        quantity: true,
        contract: { select: { type: true } },
      },
    })
    if (!current) return { ok: false, error: 'Charge not found' }
    if (current.status === 'INVOICED' || current.status === 'LOCKED') {
      return { ok: false, error: 'Locked — invoice it first' }
    }
    if (status === 'INVOICED' || status === 'LOCKED') {
      return { ok: false, error: 'Use the invoice wizard' }
    }

    // Delta against block-hours balance when toggling billable state.
    // Only applies to LABOR on a BLOCK_HOURS contract.
    const isBlockLabor =
      current.type === 'LABOR' && current.contract?.type === 'BLOCK_HOURS'
    const wasBillable = current.status === 'BILLABLE'
    const willBeBillable = status === 'BILLABLE'
    let blockHoursDelta = 0
    if (isBlockLabor && wasBillable !== willBeBillable) {
      blockHoursDelta = willBeBillable ? current.quantity : -current.quantity
    }

    await prisma.$transaction(async (tx) => {
      await tx.tH_Charge.update({
        where: { id: chargeId },
        data: {
          status,
          isBillable: willBeBillable,
        },
      })
      if (blockHoursDelta !== 0) {
        await tx.tH_Contract.update({
          where: { id: current.contractId },
          data: { blockHoursUsed: { increment: blockHoursDelta } },
        })
      }
      if (current.ticketId) {
        await tx.tH_TicketEvent.create({
          data: {
            ticketId: current.ticketId,
            userId,
            type: 'CHARGE_STATUS_CHANGE',
            data: { chargeId, from: current.status, to: status },
          },
        })
      }
    })

    if (current.ticketId) revalidatePath(`/tickets/${current.ticketId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/charges] updateStatus failed', e)
    return { ok: false, error: 'Failed to update charge' }
  }
}
