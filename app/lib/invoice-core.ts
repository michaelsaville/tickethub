import { prisma } from '@/app/lib/prisma'
import { computeTax } from '@/app/lib/tax'
import { rateForStateAsync } from '@/app/lib/tax-server'

/**
 * Internal invoice creation shared between the user-facing server action
 * and the auto-invoice cron. Mirrors `createInvoiceForClient` but does not
 * perform session-based authorization — callers are responsible for that.
 */
export async function createInvoiceCore(
  clientId: string,
  opts: {
    notes?: string | null
    dueInDays?: number
    /** When present, only include charges whose ids are in this list. */
    chargeIds?: string[]
  } = {},
): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: number; totalAmount: number }
  | { ok: false; error: string }
> {
  const client = await prisma.tH_Client.findUnique({
    where: { id: clientId },
    select: { id: true, billingState: true, isTaxExempt: true },
  })
  if (!client) return { ok: false, error: 'Client not found' }
  if (!client.billingState && !client.isTaxExempt) {
    return { ok: false, error: "Set the client's Tax State before invoicing" }
  }

  const taxState = client.billingState?.toUpperCase() ?? null
  const taxRate = client.isTaxExempt
    ? 0
    : await rateForStateAsync(taxState!)

  const charges = await prisma.tH_Charge.findMany({
    where: {
      status: 'BILLABLE',
      deletedAt: null,
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

  return {
    ok: true,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    totalAmount,
  }
}
