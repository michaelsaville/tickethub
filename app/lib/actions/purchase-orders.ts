'use server'

import { revalidatePath } from 'next/cache'
import type { TH_PurchaseOrderStatus } from '@prisma/client'
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

export async function createPurchaseOrder(input: {
  vendorId: string
  externalRef?: string
  notes?: string
  expectedAt?: string
  lines: Array<{
    description: string
    sku?: string
    quantity: number
    unitCost: number
    /** Optional link back to a TH_TicketPart so receiving auto-flips its status. */
    ticketPartId?: string
  }>
}): Promise<
  | { ok: true; id: string; poNumber: number }
  | { ok: false; error: string }
> {
  const session = await requireAdmin()
  const userId = session.user.id

  const vendor = await prisma.tH_Vendor.findUnique({
    where: { id: input.vendorId },
    select: { id: true, isActive: true, termsDays: true },
  })
  if (!vendor) return { ok: false, error: 'Vendor not found' }
  if (!vendor.isActive) return { ok: false, error: 'Vendor is inactive' }

  const lines = (input.lines ?? []).filter(
    (l) => l.description?.trim() && l.quantity > 0,
  )
  if (lines.length === 0) return { ok: false, error: 'Add at least one line' }
  if (lines.length > 200) return { ok: false, error: 'Max 200 lines per PO' }

  let expectedAt: Date | null = null
  if (input.expectedAt) {
    expectedAt = new Date(input.expectedAt)
    if (Number.isNaN(expectedAt.getTime())) expectedAt = null
  } else if (vendor.termsDays != null) {
    expectedAt = new Date()
    expectedAt.setDate(expectedAt.getDate() + vendor.termsDays)
  }

  const po = await prisma.tH_PurchaseOrder.create({
    data: {
      vendorId: input.vendorId,
      createdById: userId,
      status: 'DRAFT',
      externalRef: input.externalRef?.trim() || null,
      notes: input.notes?.trim() || null,
      expectedAt,
      lines: {
        create: lines.map((l) => ({
          description: l.description.trim(),
          sku: l.sku?.trim() || null,
          quantity: Math.round(l.quantity),
          unitCost: Math.round(l.unitCost),
          ticketPartId: l.ticketPartId || null,
        })),
      },
    },
    select: { id: true, poNumber: true },
  })

  revalidatePath('/purchase-orders')
  return { ok: true, id: po.id, poNumber: po.poNumber }
}

export async function setPurchaseOrderStatus(input: {
  id: string
  status: TH_PurchaseOrderStatus
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  const data: {
    status: TH_PurchaseOrderStatus
    sentAt?: Date
    receivedAt?: Date | null
  } = { status: input.status }
  if (input.status === 'SENT') data.sentAt = new Date()
  if (input.status === 'RECEIVED') data.receivedAt = new Date()
  if (input.status === 'DRAFT') data.receivedAt = null

  await prisma.tH_PurchaseOrder.update({
    where: { id: input.id },
    data,
  })
  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${input.id}`)
  return { ok: true }
}

/**
 * Receive N units against a PO line. Bumps `receivedQuantity`, recomputes
 * the parent PO status (PARTIAL or RECEIVED), and — when the line is
 * linked to a TH_TicketPart — flips that part to RECEIVED on full
 * receipt so the existing convert-to-charge flow on the ticket page
 * continues to work.
 */
export async function receivePurchaseOrderLine(input: {
  lineId: string
  quantity: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin()
  const userId = session.user.id
  const qty = Math.max(0, Math.floor(input.quantity))
  if (!Number.isFinite(qty)) return { ok: false, error: 'Invalid quantity' }

  const line = await prisma.tH_PurchaseOrderLine.findUnique({
    where: { id: input.lineId },
    select: {
      id: true,
      quantity: true,
      receivedQuantity: true,
      purchaseOrderId: true,
      ticketPartId: true,
      ticketPart: { select: { id: true, ticketId: true, status: true } },
    },
  })
  if (!line) return { ok: false, error: 'Line not found' }

  const newReceived = Math.min(line.quantity, qty)
  if (newReceived === line.receivedQuantity) return { ok: true }

  await prisma.$transaction(async (tx) => {
    await tx.tH_PurchaseOrderLine.update({
      where: { id: line.id },
      data: { receivedQuantity: newReceived },
    })

    // Recompute PO status from siblings
    const siblings = await tx.tH_PurchaseOrderLine.findMany({
      where: { purchaseOrderId: line.purchaseOrderId },
      select: { id: true, quantity: true, receivedQuantity: true },
    })
    const merged = siblings.map((s) =>
      s.id === line.id ? { ...s, receivedQuantity: newReceived } : s,
    )
    const allReceived = merged.every((s) => s.receivedQuantity >= s.quantity)
    const anyReceived = merged.some((s) => s.receivedQuantity > 0)
    let newStatus: TH_PurchaseOrderStatus | null = null
    if (allReceived) newStatus = 'RECEIVED'
    else if (anyReceived) newStatus = 'PARTIAL'
    if (newStatus) {
      await tx.tH_PurchaseOrder.update({
        where: { id: line.purchaseOrderId },
        data: {
          status: newStatus,
          receivedAt: allReceived ? new Date() : null,
        },
      })
    }

    // Auto-flip linked TicketPart to RECEIVED on full receipt
    if (
      line.ticketPart &&
      newReceived >= line.quantity &&
      line.ticketPart.status !== 'RECEIVED' &&
      line.ticketPart.status !== 'INSTALLED'
    ) {
      await tx.tH_TicketPart.update({
        where: { id: line.ticketPart.id },
        data: { status: 'RECEIVED' },
      })
      await tx.tH_TicketEvent.create({
        data: {
          ticketId: line.ticketPart.ticketId,
          userId,
          type: 'PART_RECEIVED_VIA_PO',
          data: { poLineId: line.id, partId: line.ticketPart.id },
        },
      })
    }
  })

  revalidatePath('/purchase-orders')
  revalidatePath(`/purchase-orders/${line.purchaseOrderId}`)
  if (line.ticketPart) revalidatePath(`/tickets/${line.ticketPart.ticketId}`)
  return { ok: true }
}

export async function deletePurchaseOrder(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  const po = await prisma.tH_PurchaseOrder.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!po) return { ok: false, error: 'PO not found' }
  if (po.status !== 'DRAFT') {
    return { ok: false, error: 'Only DRAFT POs can be deleted; cancel instead' }
  }
  await prisma.tH_PurchaseOrder.delete({ where: { id } })
  revalidatePath('/purchase-orders')
  return { ok: true }
}
