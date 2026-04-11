import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'
import { formatRate } from '@/app/lib/tax'
import { m365Configured } from '@/app/lib/m365'
import { ORG } from '@/app/lib/org'
import { InvoiceActions } from './InvoiceActions'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const isAdmin = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const { id } = await params
  const invoice = await prisma.tH_Invoice.findUnique({
    where: { id },
    include: {
      client: {
        include: {
          contacts: {
            where: { isActive: true, email: { not: null } },
            orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
            take: 1,
          },
        },
      },
      charges: {
        include: {
          item: { select: { name: true, code: true, taxable: true } },
          ticket: { select: { id: true, ticketNumber: true, title: true } },
          technician: { select: { name: true } },
        },
        orderBy: { workDate: 'asc' },
      },
    },
  })
  if (!invoice) notFound()

  const defaultTo = invoice.client.contacts[0]?.email ?? ''
  const defaultSubject = `Invoice #${invoice.invoiceNumber} from ${ORG.name}`
  const emailConfigured = m365Configured()

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <Link
            href="/invoices"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Invoices
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">
            Invoice #{invoice.invoiceNumber}
          </h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            <Link
              href={`/clients/${invoice.client.id}`}
              className="hover:text-accent"
            >
              {invoice.client.name}
            </Link>{' '}
            · issued {invoice.issueDate.toLocaleDateString()}
            {invoice.dueDate &&
              ` · due ${invoice.dueDate.toLocaleDateString()}`}
            {invoice.taxState && ` · ${invoice.taxState} ${formatRate(invoice.taxRate)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <a
              href={`/api/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="th-btn-secondary text-xs"
            >
              View PDF
            </a>
            <a
              href={`/api/invoices/${invoice.id}/pdf?download=1`}
              className="th-btn-secondary text-xs"
            >
              Download
            </a>
          </div>
          <InvoiceActions
            invoiceId={invoice.id}
            status={invoice.status}
            isAdmin={isAdmin}
            emailConfigured={emailConfigured}
            defaultTo={defaultTo}
            defaultSubject={defaultSubject}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <section>
          <div className="th-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                <tr>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 w-24 text-right">Qty/Time</th>
                  <th className="px-4 py-2 w-28 text-right">Rate</th>
                  <th className="px-4 py-2 w-32 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border">
                {invoice.charges.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <div className="text-slate-100">{c.item.name}</div>
                      {c.description && (
                        <div className="text-xs text-th-text-secondary">
                          {c.description}
                        </div>
                      )}
                      {c.ticket && (
                        <div className="text-[10px] text-th-text-muted">
                          <Link
                            href={`/tickets/${c.ticket.id}`}
                            className="hover:text-accent"
                          >
                            #{c.ticket.ticketNumber} {c.ticket.title}
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-th-text-secondary">
                      {c.timeChargedMinutes != null
                        ? formatMinutes(c.timeChargedMinutes)
                        : c.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-th-text-secondary">
                      {formatCents(c.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-slate-100">
                      {formatCents(c.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoice.notes && (
            <div className="th-card mt-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Notes
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                {invoice.notes}
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="th-card space-y-2 text-sm">
            <Row label="Subtotal" value={formatCents(invoice.subtotal)} />
            <Row
              label={`Taxable (${formatRate(invoice.taxRate)})`}
              value={formatCents(invoice.taxableSubtotal)}
            />
            <Row label="Tax" value={formatCents(invoice.taxAmount)} />
            <div className="border-t border-th-border pt-2">
              <Row
                label="Total"
                value={formatCents(invoice.totalAmount)}
                strong
              />
            </div>
          </div>
          {invoice.sentAt && (
            <div className="th-card text-xs">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Sent
              </div>
              <div className="mt-1 text-slate-200">
                {invoice.sentAt.toLocaleString()}
              </div>
            </div>
          )}
          {invoice.paidAt && (
            <div className="th-card text-xs">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Paid
              </div>
              <div className="mt-1 text-slate-200">
                {invoice.paidAt.toLocaleString()}
              </div>
            </div>
          )}
        </aside>
      </div>
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
