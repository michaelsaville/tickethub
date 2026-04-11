/**
 * Sales tax rates keyed by US state code (ISO 3166-2). Stored as basis
 * points — 600 = 6.00%. Stored as integers so we can freeze them onto
 * TH_Invoice.taxRate without floating-point drift.
 *
 * Update this table when a state changes its rate. Historical invoices
 * are unaffected because each TH_Invoice snapshots its own taxRate at
 * creation time.
 */
export const TAX_RATES_BPS: Record<string, number> = {
  WV: 600, // 6.00%
  MD: 600,
  PA: 600,
}

export const SUPPORTED_TAX_STATES = Object.keys(TAX_RATES_BPS).sort()

export function rateForState(stateCode: string | null | undefined): number {
  if (!stateCode) return 0
  return TAX_RATES_BPS[stateCode.toUpperCase()] ?? 0
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
