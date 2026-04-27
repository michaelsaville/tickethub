import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { BillingSettings } from './TaxStateSelector'
import { EditClientButton } from './EditClientButton'
import { startPortalImpersonationAction } from '@/app/lib/actions/portal-impersonate'
import { CustomFieldsCard } from '@/app/components/CustomFieldsCard'

export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const canSeeAmounts = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const { id } = await params
  const client = await prisma.tH_Client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
      sites: { orderBy: { name: 'asc' } },
      contracts: { orderBy: [{ isGlobal: 'desc' }, { createdAt: 'desc' }] },
      tickets: {
        where: {
          status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!client) notFound()

  const billableCount = await prisma.tH_Charge.count({
    where: {
      status: 'BILLABLE',
      deletedAt: null,
      contract: { clientId: client.id },
    },
  })

  // Cross-app deep-link: DocHub stores a Client row keyed by name. Match by
  // name (case-insensitive) so the header can offer one-click jump-out.
  // Returns null when no match exists, in which case the link is hidden.
  const dochubMatch = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM public."Client" WHERE lower(name) = lower(${client.name}) LIMIT 1
  `
  const dochubClientId = dochubMatch[0]?.id ?? null
  const DOCHUB_BASE =
    process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.pcc2k.com'

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/clients"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to clients
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono text-2xl text-slate-100">{client.name}</h1>
            {client.shortCode && (
              <span className="font-mono text-sm text-th-text-muted">
                {client.shortCode}
              </span>
            )}
            {!client.isActive && (
              <span className="text-xs text-th-text-muted">(inactive)</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditClientButton
              client={{
                id: client.id,
                name: client.name,
                shortCode: client.shortCode,
                internalNotes: client.internalNotes,
                isActive: client.isActive,
              }}
            />
            {dochubClientId && (
              <a
                href={`${DOCHUB_BASE}/clients/${dochubClientId}`}
                target="_blank"
                rel="noreferrer"
                className="th-btn-secondary text-sm"
                title="Open this client in DocHub (assets, credentials, runbooks)"
              >
                📁 DocHub ↗
              </a>
            )}
            {client.isActive && (
              <Link
                href={`/tickets/new?clientId=${client.id}`}
                className="th-btn-primary text-sm"
              >
                + New ticket
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[320px]">
          <BillingSettings
            clientId={client.id}
            initialState={client.billingState}
            initialEmail={client.billingEmail}
            initialTaxExempt={client.isTaxExempt}
            canEditTaxExempt={canSeeAmounts}
          />
        </div>
        {canSeeAmounts && (
          <Link
            href={`/invoices/new?clientId=${client.id}`}
            className={
              billableCount > 0 && client.billingState
                ? 'th-btn-primary'
                : 'th-btn-secondary cursor-not-allowed opacity-50'
            }
            aria-disabled={!(billableCount > 0 && client.billingState)}
          >
            + Invoice Client ({billableCount} billable)
          </Link>
        )}
        {canSeeAmounts && (
          <Link
            href={`/clients/${client.id}/payment-methods`}
            className="th-btn-secondary text-xs"
          >
            Payment methods
          </Link>
        )}
        <form action={startPortalImpersonationAction}>
          <input type="hidden" name="tickethubClientId" value={client.id} />
          <button
            type="submit"
            className="th-btn-secondary text-xs"
            title="Opens the client portal as if you were this client (read-only)"
          >
            View as client in portal ↗
          </button>
        </form>
      </div>

      {client.internalNotes && (
        <div className="th-card mb-6 border-accent/40 bg-accent/5">
          <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
            Internal Notes
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
            {client.internalNotes}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader
            title="Open Tickets"
            count={client.tickets.length}
            action={
              <Link
                href={`/tickets/new?clientId=${client.id}`}
                className="th-btn-secondary text-xs"
              >
                + New Ticket
              </Link>
            }
          />
          {client.tickets.length === 0 ? (
            <div className="th-card text-center text-sm text-th-text-secondary">
              No open tickets.
            </div>
          ) : (
            <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
              {client.tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-th-elevated"
                  >
                    <span className="font-mono text-xs text-th-text-muted">
                      #{t.ticketNumber}
                    </span>
                    <span className="flex-1 truncate text-sm text-slate-100">
                      {t.title}
                    </span>
                    <span className={priorityClass(t.priority)}>
                      {t.priority}
                    </span>
                    <span className={statusClass(t.status)}>{t.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <CustomFieldsCard entity="CLIENT" entityId={client.id} />
          <section>
            <SectionHeader
              title="Contacts"
              count={client.contacts.length}
              action={
                <Link
                  href={`/clients/${client.id}/contacts`}
                  className="text-xs text-th-text-secondary hover:text-accent"
                >
                  Manage →
                </Link>
              }
            />
            {client.contacts.length === 0 ? (
              <div className="th-card text-center text-xs text-th-text-secondary">
                No contacts yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {client.contacts.map((c) => (
                  <li key={c.id} className="th-card">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium text-slate-100">
                        {c.firstName} {c.lastName}
                      </span>
                      {c.isPrimary && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-accent">
                          Primary
                        </span>
                      )}
                    </div>
                    {c.jobTitle && (
                      <div className="text-xs text-th-text-secondary">
                        {c.jobTitle}
                      </div>
                    )}
                    {c.email && (
                      <div className="text-xs text-th-text-muted">
                        {c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div className="text-xs text-th-text-muted">
                        {c.phone}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              title="Sites"
              count={client.sites.length}
              action={
                <Link
                  href={`/clients/${client.id}/sites`}
                  className="text-xs text-th-text-secondary hover:text-accent"
                >
                  Manage →
                </Link>
              }
            />
            {client.sites.length === 0 ? (
              <div className="th-card text-center text-xs text-th-text-secondary">
                No sites yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {client.sites.map((s) => (
                  <li key={s.id} className="th-card">
                    <div className="font-medium text-slate-100">{s.name}</div>
                    {s.address && (
                      <div className="mt-1 text-xs text-th-text-secondary">
                        {s.address}
                        {s.city && `, ${s.city}`}
                        {s.state && ` ${s.state}`}
                        {s.zip && ` ${s.zip}`}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              title="Contracts"
              count={client.contracts.length}
              action={
                <Link
                  href={`/clients/${client.id}/contracts`}
                  className="text-xs text-th-text-secondary hover:text-accent"
                >
                  Manage →
                </Link>
              }
            />
            <ul className="space-y-2">
              {client.contracts.map((c) => (
                <li key={c.id} className="th-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-slate-100">{c.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                      {c.type}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-th-text-secondary">
                    {c.status}
                    {c.isGlobal && ' · default fallback'}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string
  count: number
  action?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {title} ({count})
      </h2>
      {action}
    </div>
  )
}

function statusClass(status: string): string {
  const cls = `badge-status-${status.toLowerCase().replace(/_/g, '-')}`
  return cls
}

function priorityClass(priority: string): string {
  return `badge-priority-${priority.toLowerCase()}`
}
