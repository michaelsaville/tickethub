import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'
import { computeTax, formatRate, rateForState } from '@/app/lib/tax'
import { NewInvoiceForm } from './NewInvoiceForm'

export const dynamic = 'force-dynamic'

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const canSeeAmounts = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const sp = await searchParams
  if (!sp.clientId) {
    const clients = await prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortCode: true, billingState: true },
    })
    return (
      <div className="p-6">
        <Link
          href="/invoices"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Invoices
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">New Invoice</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Pick a client — all of their BILLABLE charges will be gathered into a
          draft invoice.
        </p>
        <ul className="mt-6 divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/invoices/new?clientId=${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-th-elevated"
              >
                <span className="flex-1 text-slate-100">{c.name}</span>
                <span className="font-mono text-xs text-th-text-muted">
                  {c.billingState ?? 'no tax state'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const client = await prisma.tH_Client.findUnique({
    where: { id: sp.clientId },
    include: {
      contracts: {
        include: {
          charges: {
            where: { status: 'BILLABLE' },
            include: {
              item: { select: { name: true, taxable: true, type: true } },
              ticket: { select: { id: true, ticketNumber: true, title: true } },
            },
            orderBy: { workDate: 'asc' },
          },
        },
      },
    },
  })
  if (!client) notFound()

  const allCharges = client.contracts.flatMap((c) => c.charges)
  const subtotal = allCharges.reduce((s, c) => s + c.totalPrice, 0)
  const taxableSubtotal = allCharges.reduce(
    (s, c) => s + (c.item.taxable ? c.totalPrice : 0),
    0,
  )
  const taxRate = rateForState(client.billingState)
  const taxAmount = computeTax(taxableSubtotal, taxRate)
  const total = subtotal + taxAmount

  // Group by ticket for the preview
  const byTicket = new Map<
    string,
    {
      ticketNumber: number | null
      title: string | null
      lines: typeof allCharges
    }
  >()
  for (const charge of allCharges) {
    const key = charge.ticket?.id ?? 'no-ticket'
    const entry = byTicket.get(key) ?? {
      ticketNumber: charge.ticket?.ticketNumber ?? null,
      title: charge.ticket?.title ?? 'Unassociated charges',
      lines: [],
    }
    entry.lines.push(charge)
    byTicket.set(key, entry)
  }

  const canInvoice =
    allCharges.length > 0 && Boolean(client.billingState) && taxRate !== 0 ? true : false
  const stateReason = !client.billingState
    ? 'Client has no Tax State set — set it on the client detail page first.'
    : taxRate === 0
      ? `No tax rate configured for ${client.billingState}.`
      : null

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/invoices"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Invoices
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          New Invoice — {client.name}
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {allCharges.length} BILLABLE{' '}
          {allCharges.length === 1 ? 'charge' : 'charges'} · tax state{' '}
          <span className="font-mono text-slate-200">
            {client.billingState ?? '—'}
          </span>{' '}
          · rate{' '}
          <span className="font-mono text-slate-200">
            {formatRate(taxRate)}
          </span>
        </p>
      </header>

      {stateReason && (
        <div className="mb-4 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {stateReason}
        </div>
      )}

      {allCharges.length === 0 ? (
        <div className="th-card text-center text-sm text-th-text-secondary">
          No billable charges for this client yet.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-4">
            {Array.from(byTicket.entries()).map(([key, group]) => (
              <div key={key} className="th-card">
                <div className="mb-3 flex items-baseline justify-between">
                  <div>
                    {group.ticketNumber != null ? (
                      <Link
                        href={`/tickets/${key}`}
                        className="font-medium text-slate-100 hover:text-accent"
                      >
                        <span className="font-mono text-xs text-th-text-muted">
                          #{group.ticketNumber}
                        </span>{' '}
                        {group.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-100">
                        {group.title}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    {group.lines.length}{' '}
                    {group.lines.length === 1 ? 'line' : 'lines'}
                  </span>
                </div>
                <ul className="space-y-1 text-sm">
                  {group.lines.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-3 border-t border-th-border pt-2 first:border-0 first:pt-0"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                        {c.type}
                      </span>
                      <div className="flex-1">
                        <div className="text-slate-200">
                          {c.item.name}
                          {c.timeChargedMinutes != null && (
                            <span className="ml-2 font-mono text-xs text-th-text-muted">
                              {formatMinutes(c.timeChargedMinutes)}
                            </span>
                          )}
                          {!c.item.taxable && (
                            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                              tax-exempt
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <div className="text-xs text-th-text-secondary">
                            {c.description}
                          </div>
                        )}
                      </div>
                      {canSeeAmounts && (
                        <span className="font-mono text-sm text-slate-100">
                          {formatCents(c.totalPrice)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <aside className="space-y-4">
            {canSeeAmounts ? (
              <div className="th-card space-y-2 text-sm">
                <Row label="Subtotal" value={formatCents(subtotal)} />
                <Row
                  label={`Taxable (${formatRate(taxRate)})`}
                  value={formatCents(taxableSubtotal)}
                />
                <Row label="Tax" value={formatCents(taxAmount)} />
                <div className="border-t border-th-border pt-2">
                  <Row label="Total" value={formatCents(total)} strong />
                </div>
              </div>
            ) : (
              <div className="th-card text-xs text-th-text-muted">
                Totals visible to admin users only.
              </div>
            )}

            <NewInvoiceForm clientId={client.id} disabled={!canInvoice} />
          </aside>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-th-text-secondary">{label}</span>
      <span
        className={
          strong
            ? 'font-mono text-lg font-semibold text-slate-100'
            : 'font-mono text-slate-200'
        }
      >
        {value}
      </span>
    </div>
  )
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
