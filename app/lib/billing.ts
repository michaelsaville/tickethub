import { prisma } from '@/app/lib/prisma'
import type { TH_ChargeType } from '@prisma/client'

/**
 * Cascading price resolution (PLANNING.md §4 Decision 5).
 *
 *   1. Explicit override (passed in by caller — e.g. ticket-level override)
 *   2. Contract price exception for this item
 *   3. Technician's configured hourly rate (LABOR only)
 *   4. Item catalog default price
 *
 * Client-level default rate is not in the schema yet; when added it slots
 * between step 2 and step 3. Techs never see or pass prices directly —
 * resolution is always automatic from IDs.
 */
export async function resolveUnitPrice(params: {
  itemId: string
  contractId: string
  technicianId?: string | null
  chargeType: TH_ChargeType
  override?: number | null
}): Promise<number> {
  const { itemId, contractId, technicianId, chargeType, override } = params

  if (override != null) return override

  const exception = await prisma.tH_ContractPriceException.findFirst({
    where: { contractId, itemId },
    select: { priceOverride: true },
  })
  if (exception) return exception.priceOverride

  if (chargeType === 'LABOR' && technicianId) {
    const tech = await prisma.tH_User.findUnique({
      where: { id: technicianId },
      select: { hourlyRate: true },
    })
    if (tech?.hourlyRate != null) return tech.hourlyRate
  }

  const item = await prisma.tH_Item.findUnique({
    where: { id: itemId },
    select: { defaultPrice: true },
  })
  if (!item) throw new Error(`Item ${itemId} not found`)
  return item.defaultPrice
}

/** Format cents as a USD string. $10.99 = 1099. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const rem = abs % 100
  return `${sign}$${dollars.toLocaleString()}.${rem.toString().padStart(2, '0')}`
}

/** Parse a user-entered dollar string to integer cents. */
export function parseCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '')
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}
