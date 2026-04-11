/**
 * Sales tax rates keyed by US state code (ISO 3166-2). Stored as basis
 * points — 600 = 6.00%. Historical invoices snapshot their own taxRate at
 * creation time, so changing the table later doesn't re-bill old work.
 *
 * Rates live in TH_TaxRate (editable via /settings/tax-rates). This
 * in-code table is the seed set written to the DB the first time a rate
 * is queried and no row exists for the state yet.
 */
export const DEFAULT_TAX_RATES_BPS: Record<string, number> = {
  WV: 600, // 6.00%
  MD: 600,
  PA: 600,
}

export const DEFAULT_SUPPORTED_STATES = Object.keys(DEFAULT_TAX_RATES_BPS).sort()

// Legacy exports kept for components that still import them — these now
// resolve asynchronously via getRatesFromDb() below.
export const TAX_RATES_BPS = DEFAULT_TAX_RATES_BPS
export const SUPPORTED_TAX_STATES = DEFAULT_SUPPORTED_STATES

/**
 * Synchronous lookup against the in-code default table. Used by client
 * components and as a last-resort fallback. The server-side invoice
 * creation path uses rateForStateAsync() which hits the DB first.
 */
export function rateForState(stateCode: string | null | undefined): number {
  if (!stateCode) return 0
  return DEFAULT_TAX_RATES_BPS[stateCode.toUpperCase()] ?? 0
}

export function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`
}

/**
 * Compute tax amount in cents. Rounds to the nearest cent (banker's
 * rounding is overkill for sales tax — standard round half up matches
 * what every POS does).
 */
export function computeTax(taxableSubtotalCents: number, bps: number): number {
  if (taxableSubtotalCents <= 0 || bps <= 0) return 0
  return Math.round((taxableSubtotalCents * bps) / 10_000)
}
