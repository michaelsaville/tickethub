import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'
import { CreateDraftButton } from './CreateDraftButton'
import { BulkDraft, BulkDraftCheckbox, type BulkRow } from './BulkDraft'

export const dynamic = 'force-dynamic'

/**
 * /billing — operator's homepage for money work.
 *
 * Reports stay reports (read-only history). This page is the *action*
 * surface: see what needs your attention and bill it without bouncing
 * around the app. Phase 1 ships two cards (Backlog to Bill + Drafts to
 * Send); Phases 2 + 3 add Recurring on Deck, A/R, Health, and bulk-draft.
 */
export default async function BillingPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) redirect('/dashboard')

  const now = new Date()

  // ─── Backlog to Bill ─────────────────────────────────────────────────
  // Same query as /reports/unbilled-time, but we also pull billing-state
  // info per-client so we can flag blocked rows that would fail
  // createInvoiceCore (no tax state set, etc.).
  const charges = await prisma.tH_Charge.findMany({
    where: {
      status: 'BILLABLE',
      invoiceId: null,
      isBillable: true,
      deletedAt: null,
    },
    select: {
      id: true,
      type: true,
      totalPrice: true,
      timeChargedMinutes: true,
      workDate: true,
      contract: {
        select: {
          client: {
            select: {
              id: true,
              name: true,
              shortCode: true,
              billingState: true,
              isTaxExempt: true,
            },
          },
        },
      },
    },
    orderBy: { workDate: 'asc' },
  })

  type BacklogRow = {
    clientId: string
    name: string
    shortCode: string | null
    billingState: string | null
    isTaxExempt: boolean
    chargeCount: number
    laborMinutes: number
    totalCents: number
    oldestDaysAgo: number
  }
  const byClient = new Map<string, BacklogRow>()
  for (const c of charges) {
    const cl = c.contract?.client
    if (!cl) continue
    let row = byClient.get(cl.id)
    if (!row) {
      row = {
        clientId: cl.id,
        name: cl.name,
        shortCode: cl.shortCode,
        billingState: cl.billingState,
        isTaxExempt: cl.isTaxExempt,
        chargeCount: 0,
        laborMinutes: 0,
        totalCents: 0,
        oldestDaysAgo: 0,
      }
      byClient.set(cl.id, row)
    }
    row.chargeCount += 1
    row.totalCents += c.totalPrice
    if (c.type === 'LABOR' && c.timeChargedMinutes) {
      row.laborMinutes += c.timeChargedMinutes
    }
    const days = Math.floor(
      (now.getTime() - c.workDate.getTime()) / 86_400_000,
    )
    if (days > row.oldestDaysAgo) row.oldestDaysAgo = days
  }
  const backlogRows = [...byClient.values()].sort((a, b) => {
    if (a.oldestDaysAgo !== b.oldestDaysAgo) {
      return b.oldestDaysAgo - a.oldestDaysAgo
    }
    return b.totalCents - a.totalCents
  })
  const backlogTotalCents = backlogRows.reduce(
    (s, r) => s + r.totalCents,
    0,
  )

  // ─── Drafts to Send ──────────────────────────────────────────────────
  const drafts = await prisma.tH_Invoice.findMany({
    where: { status: 'DRAFT', deletedAt: null },
    orderBy: { issueDate: 'asc' },
    take: 100,
    select: {
      id: true,
      invoiceNumber: true,
      issueDate: true,
      totalAmount: true,
      client: { select: { id: true, name: true, shortCode: true } },
    },
  })
  const draftsTotalCents = drafts.reduce((s, d) => s + d.totalAmount, 0)

  // ─── Recurring on Deck (next 7 days) ────────────────────────────────
  // RECURRING contracts with autoInvoiceEnabled, sorted by which fires
  // soonest. We compute the next fire-date in JS rather than SQL because
  // billingDayOfMonth wraps month boundaries and we want a uniform view.
  const recurringContracts = await prisma.tH_Contract.findMany({
    where: {
      type: 'RECURRING',
      status: 'ACTIVE',
      autoInvoiceEnabled: true,
      monthlyFee: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      monthlyFee: true,
      billingDayOfMonth: true,
      autoSendInvoice: true,
      lastAutoInvoicedAt: true,
      client: { select: { id: true, name: true, shortCode: true } },
    },
  })
  const todayY = now.getFullYear()
  const todayM = now.getMonth()
  const todayD = now.getDate()
  type DeckRow = (typeof recurringContracts)[number] & {
    nextFire: Date
    daysUntil: number
    firedThisMonth: boolean
  }
  const deck: DeckRow[] = recurringContracts
    .map((c) => {
      const day = Math.min(28, Math.max(1, c.billingDayOfMonth ?? 1))
      // Next occurrence = this month if day still ahead, else next month.
      const candidateThisMonth = new Date(todayY, todayM, day)
      const nextFire =
        day < todayD
          ? new Date(todayY, todayM + 1, day)
          : candidateThisMonth
      const daysUntil = Math.floor(
        (nextFire.getTime() - now.getTime()) / 86_400_000,
      )
      const firedThisMonth = Boolean(
        c.lastAutoInvoicedAt &&
          c.lastAutoInvoicedAt.getFullYear() === todayY &&
          c.lastAutoInvoicedAt.getMonth() === todayM,
      )
      return { ...c, nextFire, daysUntil, firedThisMonth }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
  const deckSoon = deck.filter((d) => d.daysUntil <= 7)
  const recurringMonthlyTotal = deck.reduce(
    (s, d) => s + (d.monthlyFee ?? 0),
    0,
  )

  // ─── A/R — top unpaid SENT invoices (oldest first) ─────────────────
  const arInvoices = await prisma.tH_Invoice.findMany({
    where: { status: 'SENT', deletedAt: null },
    // Oldest due-date first so the most-overdue rows top the list. Null
    // due-dates sink to the bottom (Postgres default for ASC).
    orderBy: [{ dueDate: 'asc' }, { issueDate: 'asc' }],
    take: 10,
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      totalAmount: true,
      client: { select: { id: true, name: true } },
    },
  })
  const arTotalSent = await prisma.tH_Invoice.aggregate({
    where: { status: 'SENT', deletedAt: null },
    _sum: { totalAmount: true },
    _count: true,
  })

  // ─── Health strip ──────────────────────────────────────────────────
  const stripeActive = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  )
  const clientsMissingTaxState = await prisma.tH_Client.count({
    where: { isActive: true, billingState: null, isTaxExempt: false },
  })
  const recurringMisconfigured = recurringContracts.filter(
    (c) => !c.monthlyFee || c.monthlyFee <= 0,
  ).length

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Billing</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Action surface for finance work. For historical breakdowns see{' '}
          <Link
            href="/reports/unbilled-time"
            className="text-accent hover:underline"
          >
            Unbilled Time
          </Link>{' '}
          and{' '}
          <Link
            href="/reports/ar-aging"
            className="text-accent hover:underline"
          >
            A/R Aging
          </Link>
          .
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Unbilled — total"
          value={formatCents(backlogTotalCents)}
          sub={`${backlogRows.length} ${
            backlogRows.length === 1 ? 'client' : 'clients'
          } · ${charges.length} charges`}
          accent
        />
        <SummaryCard
          label="Drafts — to send"
          value={formatCents(draftsTotalCents)}
          sub={`${drafts.length} draft ${
            drafts.length === 1 ? 'invoice' : 'invoices'
          }`}
        />
        <SummaryCard
          label="A/R — sent unpaid"
          value={formatCents(arTotalSent._sum.totalAmount ?? 0)}
          sub={`${arTotalSent._count} ${
            arTotalSent._count === 1 ? 'invoice' : 'invoices'
          }`}
        />
        <SummaryCard
          label="Recurring — monthly run-rate"
          value={formatCents(recurringMonthlyTotal)}
          sub={`${deck.length} ${
            deck.length === 1 ? 'contract' : 'contracts'
          }`}
        />
      </section>

      <HealthStrip
        stripeActive={stripeActive}
        clientsMissingTaxState={clientsMissingTaxState}
        recurringMisconfigured={recurringMisconfigured}
      />

      {/* ─── Backlog to Bill ─── */}
      <section className="mb-8">
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Backlog to Bill ({backlogRows.length})
        </h2>
        {backlogRows.length === 0 ? (
          <div className="rounded-md border border-dashed border-th-border p-12 text-center">
            <div className="text-base text-slate-300">
              Nothing waiting to be invoiced.
            </div>
            <p className="mt-2 text-sm text-th-text-secondary">
              Every BILLABLE charge has been picked up by an invoice.
            </p>
          </div>
        ) : (
          <BulkDraft
            rows={backlogRows.map<BulkRow>((r) => ({
              clientId: r.clientId,
              name: r.name,
              totalCents: r.totalCents,
              blocked: !r.billingState && !r.isTaxExempt,
            }))}
          >
            <div className="overflow-hidden rounded-md border border-th-border">
              <table className="w-full text-sm">
                <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <th className="w-8 px-3 py-2 text-left" />
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-right">Charges</th>
                    <th className="px-3 py-2 text-right">Labor hrs</th>
                    <th className="px-3 py-2 text-right">Stale</th>
                    <th className="px-3 py-2 text-right">Unbilled</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-border">
                  {backlogRows.map((r) => {
                    const blocked = !r.billingState && !r.isTaxExempt
                    const blockedReason = blocked
                      ? `Set ${r.name}'s tax state before billing`
                      : null
                    return (
                      <tr key={r.clientId} className="hover:bg-th-elevated">
                        <td className="px-3 py-2 text-center">
                          <BulkDraftCheckbox
                            clientId={r.clientId}
                            blocked={blocked}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/clients/${r.clientId}`}
                            className="text-slate-100 hover:text-accent"
                          >
                            {r.name}
                          </Link>
                          {r.shortCode && (
                            <span className="ml-2 font-mono text-[10px] text-th-text-muted">
                              {r.shortCode}
                            </span>
                          )}
                          {blocked && (
                            <div className="mt-0.5 text-[10px] text-amber-400">
                              ⚠ no tax state — set on client page
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                          {r.chargeCount}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                          {r.laborMinutes > 0
                            ? (r.laborMinutes / 60).toFixed(1)
                            : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${
                            r.oldestDaysAgo >= 30
                              ? 'text-rose-400'
                              : r.oldestDaysAgo >= 14
                                ? 'text-amber-400'
                                : 'text-th-text-secondary'
                          }`}
                        >
                          {r.oldestDaysAgo}d
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                          {formatCents(r.totalCents)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/invoices/new?clientId=${r.clientId}`}
                              className="th-btn-secondary text-xs"
                              title="Open the invoice picker — choose which charges to include"
                            >
                              Pick…
                            </Link>
                            <CreateDraftButton
                              clientId={r.clientId}
                              blocked={blocked}
                              blockedReason={blockedReason}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </BulkDraft>
        )}
      </section>

      {/* ─── Recurring on Deck ─── */}
      <section className="mb-8">
        <h2 className="mb-2 flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          <span>
            Recurring on Deck — next 7 days ({deckSoon.length} of{' '}
            {deck.length})
          </span>
          {deck.length > deckSoon.length && (
            <Link
              href="/admin/contracts"
              className="text-th-text-muted hover:text-accent"
            >
              all contracts →
            </Link>
          )}
        </h2>
        {deck.length === 0 ? (
          <div className="rounded-md border border-dashed border-th-border p-6 text-center text-sm text-th-text-secondary">
            No RECURRING contracts have auto-invoice enabled. Set
            autoInvoiceEnabled + monthlyFee on the contract to surface here.
          </div>
        ) : deckSoon.length === 0 ? (
          <div className="rounded-md border border-dashed border-th-border p-6 text-center text-sm text-th-text-secondary">
            Nothing fires in the next 7 days. Soonest is{' '}
            {deck[0].client.name} on day {deck[0].billingDayOfMonth ?? 1}{' '}
            ({deck[0].daysUntil}d out).
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-th-border">
            <table className="w-full text-sm">
              <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Contract</th>
                  <th className="px-3 py-2 text-right">Monthly</th>
                  <th className="px-3 py-2 text-right">Fires</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {deckSoon.map((d) => (
                  <tr key={d.id} className="hover:bg-th-elevated">
                    <td className="px-3 py-2">
                      <Link
                        href={`/clients/${d.client.id}`}
                        className="text-slate-100 hover:text-accent"
                      >
                        {d.client.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-th-text-secondary">
                      {d.name}
                      {d.autoSendInvoice && (
                        <span className="ml-2 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-rose-300">
                          auto-send
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-100">
                      {formatCents(d.monthlyFee ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                      {d.daysUntil === 0
                        ? 'today'
                        : d.daysUntil === 1
                          ? 'tomorrow'
                          : `${d.daysUntil}d`}
                      <div className="text-[10px] text-th-text-muted">
                        day {d.billingDayOfMonth ?? 1}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {d.firedThisMonth ? (
                        <span className="rounded-full bg-status-resolved/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-status-resolved">
                          ✓ fired
                        </span>
                      ) : d.daysUntil === 0 ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                          due today
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-th-text-muted">
                          queued
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── A/R — outstanding ─── */}
      <section className="mb-8">
        <h2 className="mb-2 flex items-baseline gap-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          <span>Outstanding A/R — top {arInvoices.length}</span>
          <Link
            href="/reports/ar-aging"
            className="text-th-text-muted hover:text-accent"
          >
            full report →
          </Link>
        </h2>
        {arInvoices.length === 0 ? (
          <div className="rounded-md border border-dashed border-th-border p-6 text-center text-sm text-th-text-secondary">
            No outstanding SENT invoices. All paid up.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-th-border">
            <table className="w-full text-sm">
              <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-right">Due</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {arInvoices.map((inv) => {
                  const daysOverdue = inv.dueDate
                    ? Math.floor(
                        (now.getTime() - inv.dueDate.getTime()) / 86_400_000,
                      )
                    : null
                  const overdue = daysOverdue != null && daysOverdue > 0
                  return (
                    <tr key={inv.id} className="hover:bg-th-elevated">
                      <td className="px-3 py-2 font-mono text-th-text-muted">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/clients/${inv.client.id}`}
                          className="text-slate-100 hover:text-accent"
                        >
                          {inv.client.name}
                        </Link>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          daysOverdue != null && daysOverdue >= 30
                            ? 'text-rose-400'
                            : overdue
                              ? 'text-amber-400'
                              : 'text-th-text-secondary'
                        }`}
                      >
                        {daysOverdue == null
                          ? 'no due date'
                          : overdue
                            ? `${daysOverdue}d overdue`
                            : `in ${-daysOverdue}d`}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                        {formatCents(inv.totalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="th-btn-secondary text-xs"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Drafts to Send ─── */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Drafts to Send ({drafts.length})
        </h2>
        {drafts.length === 0 ? (
          <div className="rounded-md border border-dashed border-th-border p-8 text-center text-sm text-th-text-secondary">
            No DRAFT invoices waiting. Auto-invoice cron will spawn fresh
            ones on each contract's billing day.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-th-border">
            <table className="w-full text-sm">
              <thead className="bg-th-surface text-xs uppercase tracking-wider text-th-text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-right">Issued</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {drafts.map((d) => {
                  const days = Math.floor(
                    (now.getTime() - d.issueDate.getTime()) / 86_400_000,
                  )
                  return (
                    <tr key={d.id} className="hover:bg-th-elevated">
                      <td className="px-3 py-2 font-mono text-th-text-muted">
                        #{d.invoiceNumber}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/clients/${d.client.id}`}
                          className="text-slate-100 hover:text-accent"
                        >
                          {d.client.name}
                        </Link>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          days >= 7
                            ? 'text-amber-400'
                            : 'text-th-text-secondary'
                        }`}
                      >
                        {days}d ago
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-slate-100">
                        {formatCents(d.totalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/invoices/${d.id}`}
                          className="th-btn-secondary text-xs"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function HealthStrip({
  stripeActive,
  clientsMissingTaxState,
  recurringMisconfigured,
}: {
  stripeActive: boolean
  clientsMissingTaxState: number
  recurringMisconfigured: number
}) {
  const items: Array<{
    label: string
    ok: boolean
    detail: string
    href?: string
  }> = [
    {
      label: 'Stripe',
      ok: stripeActive,
      detail: stripeActive
        ? 'live — Pay button enabled on invoices'
        : 'inactive — set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET',
      href: '/settings/integrations',
    },
    {
      label: 'Tax states set',
      ok: clientsMissingTaxState === 0,
      detail:
        clientsMissingTaxState === 0
          ? 'every active client has a tax state'
          : `${clientsMissingTaxState} active client${
              clientsMissingTaxState === 1 ? '' : 's'
            } without a tax state — invoicing will be blocked`,
      href: '/clients',
    },
    {
      label: 'Recurring config',
      ok: recurringMisconfigured === 0,
      detail:
        recurringMisconfigured === 0
          ? 'all auto-invoice contracts have monthly fees'
          : `${recurringMisconfigured} contract${
              recurringMisconfigured === 1 ? '' : 's'
            } with autoInvoiceEnabled but no monthlyFee`,
      href: '/admin/contracts',
    },
  ]

  // When everything is green, render a thin one-liner instead of a panel.
  if (items.every((i) => i.ok)) {
    return (
      <div className="mb-6 rounded-md border border-status-resolved/30 bg-status-resolved/5 px-3 py-2 text-xs text-status-resolved">
        ✓ Billing health: all systems normal.
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-amber-300">
        Billing Health
      </div>
      <ul className="space-y-1.5 text-xs">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2">
            <span className={it.ok ? 'text-status-resolved' : 'text-amber-400'}>
              {it.ok ? '✓' : '⚠'}
            </span>
            <span className="text-slate-200">{it.label}:</span>
            {it.href ? (
              <Link
                href={it.href}
                className="text-th-text-secondary hover:text-accent"
              >
                {it.detail}
              </Link>
            ) : (
              <span className="text-th-text-secondary">{it.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        accent
          ? 'border-accent/40 bg-accent/5'
          : 'border-th-border bg-th-surface'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider text-th-text-muted">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-lg ${
          accent ? 'text-accent' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-th-text-muted">{sub}</div>}
    </div>
  )
}
