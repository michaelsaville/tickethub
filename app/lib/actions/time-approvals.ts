'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'

async function requireAdmin() {
  const { session, error } = await requireAuth()
  if (error || !session) throw new Error('Not authenticated')
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    throw new Error('Forbidden')
  }
  return session
}

export async function approveTimeCharges(input: {
  chargeIds: string[]
  /** Optional minutes-charged override per charge before approval. */
  edits?: Record<string, { chargedMinutes: number }>
}): Promise<
  | { ok: true; approved: number; skipped: number }
  | { ok: false; error: string }
> {
  const session = await requireAdmin()
  const userId = session.user.id

  if (!Array.isArray(input.chargeIds) || input.chargeIds.length === 0) {
    return { ok: false, error: 'No charges selected' }
  }
  if (input.chargeIds.length > 500) {
    return { ok: false, error: 'Max 500 charges per batch' }
  }

  const charges = await prisma.tH_Charge.findMany({
    where: { id: { in: input.chargeIds }, status: 'PENDING_REVIEW' },
    select: {
      id: true,
      ticketId: true,
      type: true,
      contractId: true,
      quantity: true,
      unitPrice: true,
      timeChargedMinutes: true,
      contract: { select: { type: true } },
    },
  })
  if (charges.length === 0) {
    return { ok: false, error: 'No PENDING_REVIEW charges in selection' }
  }

  const now = new Date()
  let approved = 0

  for (const c of charges) {
    const edit = input.edits?.[c.id]
    const newCharged =
      edit && Number.isFinite(edit.chargedMinutes) && edit.chargedMinutes > 0
        ? Math.round(edit.chargedMinutes)
        : null

    await prisma.$transaction(async (tx) => {
      const data: {
        status: 'BILLABLE'
        approvedAt: Date
        approvedById: string
        timeChargedMinutes?: number
        quantity?: number
        totalPrice?: number
      } = {
        status: 'BILLABLE',
        approvedAt: now,
        approvedById: userId,
      }
      let blockHoursDelta = 0
      if (newCharged != null && newCharged !== c.timeChargedMinutes) {
        const newQuantity = newCharged / 60
        data.timeChargedMinutes = newCharged
        data.quantity = newQuantity
        data.totalPrice = Math.round(newQuantity * c.unitPrice)
        if (c.type === 'LABOR' && c.contract?.type === 'BLOCK_HOURS') {
          blockHoursDelta = newQuantity - c.quantity
        }
      }
      await tx.tH_Charge.update({ where: { id: c.id }, data })
      if (blockHoursDelta !== 0) {
        await tx.tH_Contract.update({
          where: { id: c.contractId },
          data: { blockHoursUsed: { increment: blockHoursDelta } },
        })
      }
      if (c.ticketId) {
        await tx.tH_TicketEvent.create({
          data: {
            ticketId: c.ticketId,
            userId,
            type: 'TIME_APPROVED',
            data: {
              chargeId: c.id,
              minutes: newCharged ?? c.timeChargedMinutes,
              edited: newCharged != null,
            },
          },
        })
      }
    })
    approved += 1
  }

  revalidatePath('/billing/approvals')
  // Touch each affected ticket's page cache so the pill flips immediately.
  const ticketIds = new Set(charges.map((c) => c.ticketId).filter(Boolean) as string[])
  for (const tId of ticketIds) revalidatePath(`/tickets/${tId}`)

  return { ok: true, approved, skipped: input.chargeIds.length - approved }
}

export async function unapproveTimeCharge(input: {
  chargeId: string
  /** 'PENDING_REVIEW' to bounce back to the queue, 'NOT_BILLABLE' to write off. */
  to: 'PENDING_REVIEW' | 'NOT_BILLABLE'
  reason?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin()
  const userId = session.user.id

  const c = await prisma.tH_Charge.findUnique({
    where: { id: input.chargeId },
    select: {
      id: true,
      status: true,
      ticketId: true,
      type: true,
      quantity: true,
      contractId: true,
      contract: { select: { type: true } },
    },
  })
  if (!c) return { ok: false, error: 'Charge not found' }
  if (c.status === 'INVOICED' || c.status === 'LOCKED') {
    return { ok: false, error: 'Already invoiced or locked' }
  }
  if (c.status === input.to) return { ok: true }

  const isBlockLabor = c.type === 'LABOR' && c.contract?.type === 'BLOCK_HOURS'
  let blockHoursDelta = 0
  if (isBlockLabor) {
    const wasBillable = c.status === 'BILLABLE'
    const willBeBillable = false
    if (wasBillable !== willBeBillable) {
      blockHoursDelta = -c.quantity
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tH_Charge.update({
      where: { id: c.id },
      data: {
        status: input.to,
        isBillable: input.to === 'PENDING_REVIEW',
        approvedAt: null,
        approvedById: null,
      },
    })
    if (blockHoursDelta !== 0) {
      await tx.tH_Contract.update({
        where: { id: c.contractId },
        data: { blockHoursUsed: { increment: blockHoursDelta } },
      })
    }
    if (c.ticketId) {
      await tx.tH_TicketEvent.create({
        data: {
          ticketId: c.ticketId,
          userId,
          type: 'TIME_UNAPPROVED',
          data: {
            chargeId: c.id,
            from: c.status,
            to: input.to,
            reason: input.reason ?? null,
          },
        },
      })
    }
  })

  revalidatePath('/billing/approvals')
  if (c.ticketId) revalidatePath(`/tickets/${c.ticketId}`)
  return { ok: true }
}
