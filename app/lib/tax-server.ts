import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { DEFAULT_TAX_RATES_BPS, rateForState } from '@/app/lib/tax'

// Hidden from public tax.ts because client components can't access it.
// Server code uses this path; the client version falls back to the
// hard-coded DEFAULT_TAX_RATES_BPS table.
export { DEFAULT_TAX_RATES_BPS }

/**
 * Resolve a state's tax rate from the DB, falling back to the hard-coded
 * default table if no DB row exists yet. Callers should use this on the
 * invoice creation path so admins can edit rates without a redeploy.
 */
export async function rateForStateAsync(
  stateCode: string | null | undefined,
): Promise<number> {
  if (!stateCode) return 0
  const state = stateCode.toUpperCase()
  const row = await prisma.tH_TaxRate.findUnique({
    where: { state },
    select: { rateBps: true },
  })
  if (row) return row.rateBps
  return rateForState(state)
}

/** List of all states with a configured rate (DB rows ∪ defaults). */
export async function listSupportedStates(): Promise<string[]> {
  const rows = await prisma.tH_TaxRate.findMany({
    orderBy: { state: 'asc' },
    select: { state: true },
  })
  const set = new Set<string>(Object.keys(DEFAULT_TAX_RATES_BPS))
  for (const r of rows) set.add(r.state)
  return Array.from(set).sort()
}
