import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'
import { formatRate, SUPPORTED_TAX_STATES } from '@/app/lib/tax'

export const dynamic = 'force-dynamic'

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; status?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const canSeeAmounts = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const sp = await searchParams
  const state = sp.state?.toUpperCase()
  const status = sp.status

  const invoices = await prisma.tH_Invoice.findMany({
    where: {
      ...(state ? { taxState: state } : {}),
      ...(status ? { status: status as 'DRAFT' } : {}),
      deletedAt: null,
    },
    orderBy: { issueDate: 'desc' },
    take: 200,
    include: {
      client: { select: { id: true, name: true, shortCode: true } },
    },
  })

  // Per-state totals for the currently filtered view — the state reporting
  // hook admins will actually use at filing time.
  const stateTotals = invoices.reduce<
    Record<string, { subtotal: number; taxAmount: number; count: number }>
  >((acc, i) => {
    const k = i.taxState ?? '—'
    acc[k] ??= { subtotal: 0, taxAmount: 0, count: 0 }
    acc[k].subtotal += i.subtotal
    acc[k].taxAmount += i.taxAmount
    acc[k].count += 1
    return acc
  }, {})

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Invoices</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link
          href="/invoices"
          className={
            !state && !status
              ? 'rounded-md bg-accent/10 px-3 py-1.5 text-xs font-mono text-accent ring-1 ring-accent/30'
              : 'rounded-md border border-th-border px-3 py-1.5 text-xs font-mono text-th-text-secondary hover:text-slate-200'
          }
        >
          All
        </Link>
        {(['DRAFT', 'SENT', 'PAID', 'VOID'] as const).map((s) => (
          <Link
            key={s}
            href={`/invoices?status=${s}`}
            className={
              status === s
                ? 'rounded-md bg-accent/10 px-3 py-1.5 text-xs font-mono text-accent ring-1 ring-accent/30'
                : 'rounded-md border border-th-border px-3 py-1.5 text-xs font-mono text-th-text-secondary hover:text-slate-200'
            }
          >
            {s}
          </Link>
        ))}
        <div className="mx-2 h-6 w-px bg-th-border" />
        {SUPPORTED_TAX_STATES.map((st) => (
          <Link
            key={st}
            href={`/invoices?state=${st}`}
            className={
              state === st
                ? 'rounded-md bg-accent/10 px-3 py-1.5 text-xs font-mono text-accent ring-1 ring-accent/30'
                : 'rounded-md border border-th-border px-3 py-1.5 text-xs font-mono text-th-text-secondary hover:text-slate-200'
            }
          >
            {st}
          </Link>
        ))}
      </div>

      {canSeeAmounts && Object.keys(stateTotals).length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(stateTotals).map(([st, t]) => (
            <div key={st} className="th-card">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                {st} ({t.count})
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-100">
                {formatCents(t.subtotal + t.taxAmount)}
              </div>
              <div className="mt-0.5 text-xs text-th-text-secondary">
                tax: {formatCents(t.taxAmount)}
              </div>
            </div>
          ))}
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="th-card text-center text-sm text-th-text-secondary">
          No invoices{state ? ` for ${state}` : ''}. Invoice a client from
          their detail page.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-4 py-2 w-20">#</th>
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2 w-20">State</th>
                <th className="px-4 py-2 w-24">Status</th>
                <th className="px-4 py-2 w-28">Issued</th>
                {canSeeAmounts && (
                  <th className="px-4 py-2 w-28 text-right">Tax</th>
                )}
                {canSeeAmounts && (
                  <th className="px-4 py-2 w-32 text-right">Total</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border bg-th-surface">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="transition-colors hover:bg-th-elevated"
                >
                  <td className="px-4 py-3 font-mono text-xs text-th-text-muted">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="hover:text-accent"
                    >
                      #{inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${inv.client.id}`}
                      className="text-slate-100 hover:text-accent"
                    >
                      {inv.client.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-th-text-secondary">
                    {inv.taxState ?? '—'}
                    {inv.taxState && (
                      <span className="ml-1 text-[10px] text-th-text-muted">
                        {formatRate(inv.taxRate)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-th-text-muted">
                    {inv.issueDate.toLocaleDateString()}
                  </td>
                  {canSeeAmounts && (
                    <td className="px-4 py-3 text-right font-mono text-xs text-th-text-secondary">
                      {formatCents(inv.taxAmount)}
                    </td>
                  )}
                  {canSeeAmounts && (
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate-100">
                      {formatCents(inv.totalAmount)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InvoiceBadge({ status }: { status: string }) {
  const cls =
    status === 'PAID'
      ? 'bg-status-resolved/20 text-status-resolved'
      : status === 'SENT' || status === 'VIEWED'
        ? 'bg-status-in-progress/20 text-status-in-progress'
        : status === 'VOID'
          ? 'bg-th-elevated text-th-text-muted'
          : status === 'OVERDUE'
            ? 'bg-priority-urgent/20 text-priority-urgent'
            : 'bg-status-new/20 text-status-new'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  )
}
