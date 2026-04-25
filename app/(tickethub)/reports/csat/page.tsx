import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'

export const dynamic = 'force-dynamic'

type WindowDays = 30 | 90 | 365

export default async function CsatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) redirect('/dashboard')

  const params = await searchParams
  const days: WindowDays =
    params.days === '30' ? 30 : params.days === '365' ? 365 : 90
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [sentRows, recent] = await Promise.all([
    prisma.tH_CsatSurvey.findMany({
      where: { sentAt: { gte: since } },
      select: { score: true, respondedAt: true },
    }),
    prisma.tH_CsatSurvey.findMany({
      where: { respondedAt: { not: null, gte: since } },
      orderBy: { respondedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        score: true,
        comment: true,
        respondedAt: true,
        toEmail: true,
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            client: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        },
      },
    }),
  ])

  const sent = sentRows.length
  const responded = sentRows.filter((r) => r.respondedAt && r.score).length
  const responseRate = sent === 0 ? 0 : Math.round((responded / sent) * 100)
  const avgScore =
    responded === 0
      ? 0
      : sentRows.reduce((acc, r) => acc + (r.score ?? 0), 0) / responded

  const distribution = [1, 2, 3, 4, 5].map((n) => ({
    score: n,
    count: sentRows.filter((r) => r.score === n).length,
  }))

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Link
            href="/reports"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Reports
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">CSAT</h1>
          <p className="mt-1 text-xs text-th-text-muted">
            Surveys sent in the last {days} days
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-th-border bg-th-surface p-1">
          {([30, 90, 365] as const).map((d) => (
            <Link
              key={d}
              href={`/reports/csat?days=${d}`}
              className={`rounded px-3 py-1 text-xs ${
                days === d
                  ? 'bg-accent/20 text-accent'
                  : 'text-th-text-secondary hover:bg-th-elevated'
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="th-card">
          <div className="text-xs uppercase tracking-wider text-th-text-muted">
            Avg score
          </div>
          <div className="mt-2 font-mono text-3xl text-amber-400">
            {responded === 0 ? '—' : avgScore.toFixed(2)}
            <span className="ml-1 text-sm text-th-text-muted">/ 5</span>
          </div>
        </div>
        <div className="th-card">
          <div className="text-xs uppercase tracking-wider text-th-text-muted">
            Response rate
          </div>
          <div className="mt-2 font-mono text-3xl text-slate-100">
            {responseRate}%
          </div>
          <div className="mt-1 text-xs text-th-text-muted">
            {responded} of {sent} responded
          </div>
        </div>
        <div className="th-card">
          <div className="text-xs uppercase tracking-wider text-th-text-muted">
            Distribution
          </div>
          <div className="mt-3 space-y-1">
            {distribution
              .slice()
              .reverse()
              .map((d) => {
                const pct = responded === 0 ? 0 : (d.count / responded) * 100
                return (
                  <div key={d.score} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-amber-400">
                      {'★'.repeat(d.score)}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-th-text-muted">
                      {d.count}
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Recent responses
      </h2>
      {recent.length === 0 ? (
        <p className="rounded-lg border border-th-border bg-th-surface p-4 text-sm text-th-text-secondary">
          No responses in this window yet.
        </p>
      ) : (
        <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
          {recent.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/tickets/${r.ticket.id}`}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  #{r.ticket.ticketNumber}
                </Link>
                <span className="text-amber-400">
                  {'★'.repeat(r.score ?? 0)}
                </span>
              </div>
              <div className="mt-1 truncate text-sm text-slate-200">
                {r.ticket.title}
              </div>
              <div className="text-xs text-th-text-muted">
                {r.ticket.client.name}
                {r.ticket.assignedTo && <> · {r.ticket.assignedTo.name}</>}
                <> · {r.respondedAt!.toLocaleDateString()}</>
              </div>
              {r.comment && (
                <p className="mt-2 rounded border-l-2 border-amber-500/40 bg-th-elevated p-2 text-sm text-slate-300">
                  {r.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
