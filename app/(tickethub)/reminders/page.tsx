import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const sp = await searchParams
  const statusFilter = sp.status || 'ACTIVE'
  const sourceFilter = sp.source || ''

  const where: Record<string, unknown> = {}
  if (statusFilter && statusFilter !== 'ALL') where.status = statusFilter
  if (sourceFilter) where.source = sourceFilter

  const reminders = await prisma.tH_Reminder.findMany({
    where,
    orderBy: { nextNotifyAt: 'asc' },
    take: 200,
    include: {
      contact: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          client: { select: { id: true, name: true, shortCode: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  })

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl text-slate-100">Reminders</h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/reminders/new" className="th-btn-primary">
          + New Reminder
        </Link>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['ACTIVE', 'SNOOZED', 'ACKNOWLEDGED', 'CANCELLED', 'ALL'].map((s) => (
          <Link
            key={s}
            href={`/reminders?status=${s}${sourceFilter ? `&source=${sourceFilter}` : ''}`}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-accent text-white'
                : 'bg-th-surface-raised text-th-text-secondary hover:text-accent'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </Link>
        ))}
        <span className="mx-2 text-th-text-muted">|</span>
        {['', 'MANUAL', 'SYNCRO_ESTIMATE'].map((s) => (
          <Link
            key={s || 'all-src'}
            href={`/reminders?status=${statusFilter}${s ? `&source=${s}` : ''}`}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              sourceFilter === s
                ? 'bg-accent text-white'
                : 'bg-th-surface-raised text-th-text-secondary hover:text-accent'
            }`}
          >
            {s ? s.replace(/_/g, ' ') : 'All Sources'}
          </Link>
        ))}
      </div>

      {reminders.length === 0 ? (
        <div className="th-card mt-6 text-center">
          <p className="text-sm text-th-text-secondary">
            No reminders matching the current filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-th-border">
          <table className="w-full text-sm">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2 w-28">Source</th>
                <th className="px-3 py-2 w-28">Recurrence</th>
                <th className="px-3 py-2 w-28">Next Notify</th>
                <th className="px-3 py-2 w-16 text-center">Sent</th>
                <th className="px-3 py-2 w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border bg-th-surface">
              {reminders.map((r) => (
                <tr key={r.id} className="hover:bg-th-elevated">
                  <td className="px-3 py-2">
                    <div className="text-slate-200">{r.title}</div>
                    {r.body && (
                      <div className="text-xs text-th-text-muted truncate max-w-xs">
                        {r.body}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-th-text-secondary">
                    <div>
                      {r.contact.firstName} {r.contact.lastName}
                    </div>
                    <div className="text-xs text-th-text-muted">
                      <Link
                        href={`/clients/${r.contact.client.id}`}
                        className="hover:text-accent"
                      >
                        {r.contact.client.shortCode ?? r.contact.client.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase ${
                        r.source === 'SYNCRO_ESTIMATE'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-th-surface-raised text-th-text-muted'
                      }`}
                    >
                      {r.source === 'SYNCRO_ESTIMATE' ? 'Syncro' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-th-text-secondary">
                    {r.recurrence.replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-th-text-muted">
                    {r.status === 'ACTIVE'
                      ? new Date(r.nextNotifyAt).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-th-text-muted">
                    {r.notifyCount}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase ${
                        r.status === 'ACTIVE'
                          ? 'bg-green-500/20 text-green-400'
                          : r.status === 'SNOOZED'
                            ? 'bg-accent/20 text-accent'
                            : r.status === 'ACKNOWLEDGED'
                              ? 'bg-th-surface-raised text-th-text-muted'
                              : 'bg-priority-urgent/20 text-priority-urgent'
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
