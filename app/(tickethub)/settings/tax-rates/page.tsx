import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { DEFAULT_TAX_RATES_BPS } from '@/app/lib/tax'
import { TaxRatesList } from './TaxRatesList'

export const dynamic = 'force-dynamic'

export default async function TaxRatesPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Tax Rates</h1>
        <p className="mt-2 text-sm text-priority-urgent">Admin role required.</p>
      </div>
    )
  }

  const dbRows = await prisma.tH_TaxRate.findMany({
    orderBy: { state: 'asc' },
  })
  const dbStates = new Set(dbRows.map((r) => r.state))

  const rows = [
    ...dbRows.map((r) => ({
      state: r.state,
      rateBps: r.rateBps,
      label: r.label,
      source: 'db' as const,
    })),
    ...Object.entries(DEFAULT_TAX_RATES_BPS)
      .filter(([s]) => !dbStates.has(s))
      .map(([state, rateBps]) => ({
        state,
        rateBps,
        label: null,
        source: 'default' as const,
      })),
  ].sort((a, b) => a.state.localeCompare(b.state))

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Tax Rates</h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Sales tax rates by state. Stored as basis points — 600 = 6.00%.
          Historical invoices are unaffected when rates change; each invoice
          freezes its own rate at creation time. Default rows become saved
          rows the first time you edit them.
        </p>
      </header>

      <TaxRatesList initial={rows} />
    </div>
  )
}
