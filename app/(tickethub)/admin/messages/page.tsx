import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { listTemplates } from '@/app/lib/messaging/templates'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ tab?: string; q?: string; mode?: string }>
}

export default async function AdminMessagesPage({ searchParams }: Props) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Messages</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required.
        </p>
      </div>
    )
  }

  const params = await searchParams
  const tab = params.tab === 'log' ? 'log' : 'templates'
  const q = (params.q ?? '').trim()
  const modeFilter = (params.mode ?? '').trim()
  const templates = listTemplates()

  const logWhere: Record<string, unknown> = {}
  if (modeFilter) logWhere.mode = modeFilter
  if (q) {
    logWhere.OR = [
      { toEmail: { contains: q, mode: 'insensitive' } },
      { toName: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [log, totalSent, totalFailed] = await Promise.all([
    prisma.tH_TicketEmailOutbound.findMany({
      where: logWhere,
      orderBy: { sentAt: 'desc' },
      take: 100,
    }),
    prisma.tH_TicketEmailOutbound.count({ where: { status: 'SENT' } }),
    prisma.tH_TicketEmailOutbound.count({ where: { status: 'FAILED' } }),
  ])

  const grouped: Record<string, ReturnType<typeof listTemplates>> = {}
  for (const t of templates) {
    grouped[t.category] = [...(grouped[t.category] ?? []), t]
  }
  const unloggedCount = templates.filter((t) => !t.logged).length

  return (
    <div className="p-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link
            href="/settings"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Settings
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">Messages</h1>
          <p className="mt-1 text-sm text-th-text-secondary">
            {templates.length} template{templates.length === 1 ? '' : 's'} catalogued ·{' '}
            {totalSent} sent · {totalFailed} failed
            {unloggedCount > 0 && (
              <>
                {' '}·{' '}
                <span className="text-amber-400">
                  {unloggedCount} sender
                  {unloggedCount === 1 ? ' does' : 's do'} not yet log — see
                  Templates tab
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <div className="mb-6 flex gap-2">
        <Link
          href="/admin/messages?tab=templates"
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'templates' ? 'bg-amber-600 text-white' : 'bg-th-surface border border-th-border text-slate-300 hover:bg-th-elevated'}`}
        >
          Templates ({templates.length})
        </Link>
        <Link
          href="/admin/messages?tab=log"
          className={`rounded-md px-3 py-1.5 text-sm ${tab === 'log' ? 'bg-amber-600 text-white' : 'bg-th-surface border border-th-border text-slate-300 hover:bg-th-elevated'}`}
        >
          Sent log
        </Link>
      </div>

      {tab === 'templates' ? (
        <section className="space-y-5">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                {category}
              </h2>
              <div className="space-y-3">
                {items.map((t) => (
                  <div
                    key={t.mode}
                    className="th-card space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-slate-100">
                            {t.name}
                          </h3>
                          {!t.logged && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                              not logged
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-th-text-secondary">
                          {t.description}
                        </p>
                      </div>
                      <code className="text-[11px] text-th-text-muted font-mono">
                        {t.mode}
                      </code>
                    </div>

                    <div className="text-xs text-th-text-muted">
                      <span className="uppercase tracking-wider">source:</span>{' '}
                      <code className="font-mono text-slate-300">{t.source}</code>
                    </div>

                    {t.preview ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-300 hover:text-amber-300">
                          Preview with sample data ↓
                        </summary>
                        <div className="mt-2 space-y-2">
                          <div className="text-xs text-th-text-muted">
                            <span className="uppercase tracking-wider">subject:</span>{' '}
                            <span className="text-slate-100">{t.preview.subject}</span>
                          </div>
                          <iframe
                            srcDoc={t.preview.html}
                            title={`${t.mode} preview`}
                            className="w-full h-[440px] bg-white rounded border border-th-border"
                          />
                        </div>
                      </details>
                    ) : (
                      <div className="text-xs italic text-th-text-muted">
                        Live preview not available — this sender keeps its
                        template inline; to catalogue it, export the render
                        helper from the source file.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section>
          <form
            action="/admin/messages"
            method="get"
            className="mb-3 flex flex-wrap gap-2 items-end"
          >
            <input type="hidden" name="tab" value="log" />
            <label className="text-sm">
              <span className="block text-xs font-medium text-th-text-muted mb-1">
                Search
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="email / name / subject"
                className="th-input text-xs"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-th-text-muted mb-1">
                Template
              </span>
              <select
                name="mode"
                defaultValue={modeFilter}
                className="th-input text-xs"
              >
                <option value="">any</option>
                {templates.map((t) => (
                  <option key={t.mode} value={t.mode}>
                    {t.mode}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-amber-600 text-white text-xs px-3 py-2 hover:bg-amber-500"
            >
              Filter
            </button>
            {(q || modeFilter) && (
              <Link
                href="/admin/messages?tab=log"
                className="text-xs text-th-text-muted hover:text-amber-300"
              >
                clear
              </Link>
            )}
          </form>

          {log.length === 0 ? (
            <div className="th-card text-center py-10 text-sm text-th-text-muted">
              No messages match.
            </div>
          ) : (
            <div className="rounded-lg border border-th-border bg-th-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-th-elevated text-left text-[10px] uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">To</th>
                    <th className="px-4 py-2">Template</th>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-4 py-2 w-20">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-border/40">
                  {log.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 text-xs text-th-text-secondary whitespace-nowrap">
                        {m.sentAt.toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-slate-100">{m.toEmail}</div>
                        {m.toName && (
                          <div className="text-xs text-th-text-muted">
                            {m.toName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <code className="text-[11px] text-th-text-secondary font-mono">
                          {m.mode}
                        </code>
                        {m.ticketId && (
                          <div>
                            <Link
                              href={`/tickets/${m.ticketId}`}
                              className="text-[10px] text-amber-400 hover:underline"
                            >
                              view ticket →
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-300">
                        {m.subject}
                        {m.errorMessage && (
                          <div className="text-[11px] text-priority-urgent mt-0.5">
                            {m.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${m.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[11px] text-th-text-muted border-t border-th-border">
                Most recent 100 shown.
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
