import { prisma } from '@/app/lib/prisma'
import { createInvoiceCore } from '@/app/lib/invoice-core'

/**
 * Auto-invoice engine for recurring (monthlyFee) contracts. Keeps its own
 * "current month in America/New_York" anchor so idempotency is stable
 * regardless of when during the day the cron fires.
 */

const BILLING_TZ = 'America/New_York'
const MONTHLY_FEE_ITEM_CODE = 'MONTHLY-FEE'

/** Ensure the synthetic "Monthly Contract Fee" item exists. Idempotent. */
export async function ensureMonthlyFeeItem(): Promise<string> {
  const existing = await prisma.tH_Item.findUnique({
    where: { code: MONTHLY_FEE_ITEM_CODE },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.tH_Item.create({
    data: {
      code: MONTHLY_FEE_ITEM_CODE,
      name: 'Monthly Contract Fee',
      type: 'CONTRACT_FEE',
      defaultPrice: 0, // real price lives on the contract
      taxable: true,
      isActive: false, // hidden from the normal picker — auto-use only
    },
    select: { id: true },
  })
  return created.id
}

interface ZonedYearMonth {
  year: number
  month: number // 1..12
  day: number
}

function yearMonthInZone(date: Date, tz: string): ZonedYearMonth {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
  }
}

function monthName(month: number): string {
  return [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][month - 1]
}

/** Same calendar month + year in the billing timezone? */
function sameBillingMonth(a: Date, b: Date): boolean {
  const aa = yearMonthInZone(a, BILLING_TZ)
  const bb = yearMonthInZone(b, BILLING_TZ)
  return aa.year === bb.year && aa.month === bb.month
}

/**
 * Create a CONTRACT_FEE charge + DRAFT invoice for one contract.
 * Bumps `lastAutoInvoicedAt` on success. Does NOT auto-send (caller decides).
 *
 * Returns the invoiceId so the caller can optionally call sendInvoiceEmail.
 */
export async function spawnMonthlyInvoiceForContract(
  contractId: string,
): Promise<
  | {
      ok: true
      contractId: string
      invoiceId: string
      invoiceNumber: number
      chargeId: string
      totalAmount: number
    }
  | { ok: false; contractId: string; error: string }
> {
  const contract = await prisma.tH_Contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      clientId: true,
      name: true,
      type: true,
      status: true,
      monthlyFee: true,
      autoInvoiceEnabled: true,
      autoSendInvoice: true,
      billingDayOfMonth: true,
      lastAutoInvoicedAt: true,
    },
  })
  if (!contract) return { ok: false, contractId, error: 'Contract not found' }
  if (!contract.autoInvoiceEnabled) {
    return { ok: false, contractId, error: 'Auto-invoice not enabled' }
  }
  if (contract.status !== 'ACTIVE') {
    return { ok: false, contractId, error: 'Contract is not active' }
  }
  if (!contract.monthlyFee || contract.monthlyFee <= 0) {
    return { ok: false, contractId, error: 'Contract has no monthlyFee set' }
  }

  const now = new Date()
  if (
    contract.lastAutoInvoicedAt &&
    sameBillingMonth(contract.lastAutoInvoicedAt, now)
  ) {
    return { ok: false, contractId, error: 'Already invoiced this month' }
  }

  const itemId = await ensureMonthlyFeeItem()
  const { year, month } = yearMonthInZone(now, BILLING_TZ)
  const description = `${contract.name} — ${monthName(month)} ${year}`

  try {
    // Charge + invoice share a transaction so we never leave an orphan charge.
    const result = await prisma.$transaction(async (tx) => {
      const charge = await tx.tH_Charge.create({
        data: {
          contractId: contract.id,
          itemId,
          type: 'CONTRACT_FEE',
          status: 'BILLABLE',
          description,
          quantity: 1,
          unitPrice: contract.monthlyFee!,
          totalPrice: contract.monthlyFee!,
          isBillable: true,
        },
        select: { id: true },
      })
      return { chargeId: charge.id }
    })

    const invoiceResult = await createInvoiceCore(contract.clientId, {
      chargeIds: [result.chargeId],
      dueInDays: 30,
      notes: `Auto-generated — ${description}`,
    })
    if (!invoiceResult.ok) {
      // Release the orphaned charge so the client's BILLABLE list stays clean.
      await prisma.tH_Charge.delete({ where: { id: result.chargeId } })
      return { ok: false, contractId, error: invoiceResult.error }
    }

    await prisma.tH_Contract.update({
      where: { id: contract.id },
      data: { lastAutoInvoicedAt: now },
    })

    return {
      ok: true,
      contractId,
      invoiceId: invoiceResult.invoiceId,
      invoiceNumber: invoiceResult.invoiceNumber,
      chargeId: result.chargeId,
      totalAmount: invoiceResult.totalAmount,
    }
  } catch (e) {
    console.error(
      `[auto-invoice] spawn failed for contract ${contract.id}`,
      e,
    )
    return {
      ok: false,
      contractId,
      error: e instanceof Error ? e.message : 'Spawn failed',
    }
  }
}

/**
 * Scan for contracts that should auto-invoice today and spawn invoices
 * for each. Returns a summary for the cron response body.
 */
export async function runAutoInvoiceSweep(): Promise<{
  checkedAt: string
  examined: number
  spawned: number
  skipped: number
  results: Array<
    | {
        status: 'spawned'
        contractId: string
        clientId: string
        invoiceId: string
        invoiceNumber: number
        totalAmount: number
      }
    | { status: 'skipped'; contractId: string; reason: string }
    | { status: 'error'; contractId: string; error: string }
  >
}> {
  const now = new Date()
  const today = yearMonthInZone(now, BILLING_TZ).day

  const candidates = await prisma.tH_Contract.findMany({
    where: {
      autoInvoiceEnabled: true,
      status: 'ACTIVE',
      monthlyFee: { gt: 0 },
      billingDayOfMonth: today,
    },
    select: {
      id: true,
      clientId: true,
      autoSendInvoice: true,
      lastAutoInvoicedAt: true,
    },
  })

  const results: Array<
    | {
        status: 'spawned'
        contractId: string
        clientId: string
        invoiceId: string
        invoiceNumber: number
        totalAmount: number
      }
    | { status: 'skipped'; contractId: string; reason: string }
    | { status: 'error'; contractId: string; error: string }
  > = []
  let spawned = 0
  let skipped = 0

  for (const c of candidates) {
    if (
      c.lastAutoInvoicedAt &&
      sameBillingMonth(c.lastAutoInvoicedAt, now)
    ) {
      results.push({
        status: 'skipped',
        contractId: c.id,
        reason: 'already invoiced this month',
      })
      skipped += 1
      continue
    }
    const r = await spawnMonthlyInvoiceForContract(c.id)
    if (r.ok) {
      spawned += 1
      results.push({
        status: 'spawned',
        contractId: c.id,
        clientId: c.clientId,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        totalAmount: r.totalAmount,
      })
      // autoSendInvoice is intentionally NOT wired in the cron yet — the
      // staff Monday go-live wants eyes on every draft. Flip this on once
      // the pattern is trusted.
    } else {
      results.push({
        status: 'error',
        contractId: c.id,
        error: r.error,
      })
    }
  }

  return {
    checkedAt: now.toISOString(),
    examined: candidates.length,
    spawned,
    skipped,
    results,
  }
}
