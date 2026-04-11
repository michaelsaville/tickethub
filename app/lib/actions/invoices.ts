'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import type { TH_InvoiceStatus } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { computeTax } from '@/app/lib/tax'
import { rateForStateAsync } from '@/app/lib/tax-server'

const ADMIN_ROLES = new Set(['GLOBAL_ADMIN', 'TICKETHUB_ADMIN'])

export type InvoiceResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string }

export type StatusResult = { ok: true } | { ok: false; error: string }

async function getSession() {
  const session = await getServerSession(authOptions)
  return session
}

/**
 * Create a DRAFT invoice for every BILLABLE charge attached to the given
 * client. Freezes the client's billingState → invoice.taxState and the
 * matching rate → invoice.taxRate. Per-charge `taxable` flag governs what
 * flows into taxableSubtotal.
 */
export async function createInvoiceForClient(
  clientId: string,
  opts: {
    notes?: string
    dueInDays?: number
    /** When present, only include charges whose ids are in this list. */
    chargeIds?: string[]
  } = {},
): Promise<InvoiceResult> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }

  try {
    const client = await prisma.tH_Client.findUnique({
      where: { id: clientId },
      select: { id: true, billingState: true },
    })
    if (!client) return { ok: false, error: 'Client not found' }
    if (!client.billingState) {
      return {
        ok: false,
        error: 'Set the client\'s Tax State before invoicing',
      }
    }

    const taxState = client.billingState.toUpperCase()
    const taxRate = await rateForStateAsync(taxState)

    // When specific chargeIds are passed, only include those — but
    // still verify they're BILLABLE and belong to this client via the
    // contract, so a bad ID can't sneak charges across clients.
    const charges = await prisma.tH_Charge.findMany({
      where: {
        status: 'BILLABLE',
        contract: { clientId },
        ...(opts.chargeIds && opts.chargeIds.length > 0
          ? { id: { in: opts.chargeIds } }
          : {}),
      },
      include: { item: { select: { taxable: true } } },
    })
    if (charges.length === 0) {
      return {
        ok: false,
        error:
          opts.chargeIds && opts.chargeIds.length > 0
            ? 'None of the selected charges are billable'
            : 'No billable charges for this client',
      }
    }

    const subtotal = charges.reduce((sum, c) => sum + c.totalPrice, 0)
    const taxableSubtotal = charges.reduce(
      (sum, c) => sum + (c.item.taxable ? c.totalPrice : 0),
      0,
    )
    const taxAmount = computeTax(taxableSubtotal, taxRate)
    const totalAmount = subtotal + taxAmount

    const dueInDays = opts.dueInDays ?? 30
    const issueDate = new Date()
    const dueDate = new Date(issueDate.getTime() + dueInDays * 86_400_000)

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.tH_Invoice.create({
        data: {
          clientId,
          status: 'DRAFT',
          issueDate,
          dueDate,
          subtotal,
          taxableSubtotal,
          taxState,
          taxRate,
          taxAmount,
          totalAmount,
          notes: opts.notes?.trim() || null,
        },
      })
      await tx.tH_Charge.updateMany({
        where: { id: { in: charges.map((c) => c.id) } },
        data: { invoiceId: inv.id, status: 'INVOICED' },
      })
      return inv
    })

    revalidatePath('/invoices')
    revalidatePath(`/clients/${clientId}`)
    return { ok: true, invoiceId: invoice.id }
  } catch (e) {
    console.error('[actions/invoices] create failed', e)
    return { ok: false, error: 'Failed to create invoice' }
  }
}

/**
 * Transition invoice status. Non-admins follow the normal flow:
 *   DRAFT → SENT (locks charges)
 *   SENT  → PAID
 *   DRAFT → VOID (releases charges to BILLABLE)
 *
 * Admins can transition to any status at any time, including reopening
 * a PAID or SENT invoice by voiding it (charges revert to BILLABLE).
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  next: TH_InvoiceStatus,
): Promise<StatusResult> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  const isAdmin = ADMIN_ROLES.has(session.user.role)

  try {
    const current = await prisma.tH_Invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, clientId: true },
    })
    if (!current) return { ok: false, error: 'Invoice not found' }
    if (current.status === next) return { ok: true }

    // Non-admin transition map
    const ALLOWED: Partial<Record<TH_InvoiceStatus, TH_InvoiceStatus[]>> = {
      DRAFT: ['SENT', 'VOID'],
      SENT: ['PAID', 'VIEWED'],
      VIEWED: ['PAID'],
      PAID: [],
      VOID: [],
      OVERDUE: ['PAID'],
    }
    if (!isAdmin) {
      const allowed = ALLOWED[current.status] ?? []
      if (!allowed.includes(next)) {
        return {
          ok: false,
          error: `Admin role required for ${current.status} → ${next}`,
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Charge transitions tied to invoice lifecycle
      if (next === 'SENT') {
        await tx.tH_Charge.updateMany({
          where: { invoiceId },
          data: { status: 'LOCKED' },
        })
      } else if (next === 'VOID') {
        // Release charges back to BILLABLE so they can be re-invoiced
        await tx.tH_Charge.updateMany({
          where: { invoiceId },
          data: { status: 'BILLABLE', invoiceId: null },
        })
      } else if (
        isAdmin &&
        (current.status === 'SENT' ||
          current.status === 'VIEWED' ||
          current.status === 'PAID') &&
        next === 'DRAFT'
      ) {
        // Admin reopen: unlock charges back to INVOICED but keep the link
        await tx.tH_Charge.updateMany({
          where: { invoiceId },
          data: { status: 'INVOICED' },
        })
      }

      await tx.tH_Invoice.update({
        where: { id: invoiceId },
        data: {
          status: next,
          sentAt: next === 'SENT' ? new Date() : undefined,
          paidAt: next === 'PAID' ? new Date() : undefined,
        },
      })
    })

    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/invoices')
    revalidatePath(`/clients/${current.clientId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/invoices] updateStatus failed', e)
    return { ok: false, error: 'Failed to update status' }
  }
}

/**
 * Admin-only: reopen an invoice by voiding it and freeing its charges.
 * Shortcut wrapping updateInvoiceStatus with the admin privilege check.
 */
export async function reopenInvoice(
  invoiceId: string,
): Promise<StatusResult> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { ok: false, error: 'Admin role required' }
  }
  return updateInvoiceStatus(invoiceId, 'VOID')
}

export async function updateClientBillingState(
  clientId: string,
  state: string | null,
): Promise<StatusResult> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  try {
    await prisma.tH_Client.update({
      where: { id: clientId },
      data: { billingState: state ? state.toUpperCase() : null },
    })
    revalidatePath(`/clients/${clientId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/invoices] updateBillingState failed', e)
    return { ok: false, error: 'Failed to update tax state' }
  }
}

export async function updateClientBillingEmail(
  clientId: string,
  email: string | null,
): Promise<StatusResult> {
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  const trimmed = email?.trim() || null
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'Invalid email address' }
  }
  try {
    await prisma.tH_Client.update({
      where: { id: clientId },
      data: { billingEmail: trimmed },
    })
    revalidatePath(`/clients/${clientId}`)
    return { ok: true }
  } catch (e) {
    console.error('[actions/invoices] updateBillingEmail failed', e)
    return { ok: false, error: 'Failed to update billing email' }
  }
}

export async function deleteDraftInvoice(
  invoiceId: string,
): Promise<StatusResult> {
  // Convenience for mistakes: only allow hard deletion of DRAFT invoices.
  const session = await getSession()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  try {
    const inv = await prisma.tH_Invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, clientId: true },
    })
    if (!inv) return { ok: false, error: 'Not found' }
    if (inv.status !== 'DRAFT') {
      return { ok: false, error: 'Only DRAFT invoices can be deleted — void instead' }
    }
    await prisma.$transaction([
      prisma.tH_Charge.updateMany({
        where: { invoiceId },
        data: { status: 'BILLABLE', invoiceId: null },
      }),
      prisma.tH_Invoice.delete({ where: { id: invoiceId } }),
    ])
    revalidatePath('/invoices')
    revalidatePath(`/clients/${inv.clientId}`)
    redirect('/invoices')
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[actions/invoices] delete failed', e)
    return { ok: false, error: 'Failed to delete invoice' }
  }
}
