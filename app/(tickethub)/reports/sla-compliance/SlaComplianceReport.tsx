'use client'

import { useEffect, useState } from 'react'
import { DateRangePicker } from '@/app/components/reports/DateRangePicker'
import { downloadCsv } from '@/app/lib/csv-export'

interface Overall {
  total: number
  met: number
  breached: number
  atRisk: number
}

interface PriorityRow {
  priority: string
  total: number
  breached: number
  breachRate: number
}

interface ClientRow {
  clientId: string
  clientName: string
  clientShortCode: string | null
  total: number
  breached: number
  breachRate: number
}

interface ReportData {
  overall: Overall
  byPriority: PriorityRow[]
  byClient: ClientRow[]
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function BreachBar({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-th-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-red-500"
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-th-text-secondary">
        {rate.toFixed(1)}%
      </span>
    </div>
  )
}

export function SlaComplianceReport() {
  const now = new Date()
  const thirtyAgo = new Date(now)
  thirtyAgo.setDate(thirtyAgo.getDate() - 29)

  const [startDate, setStartDate] = useState(iso(thirtyAgo))
  const [endDate, setEndDate] = useState(iso(now))
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/sla-compliance?start=${startDate}&end=${endDate}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setData(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [startDate, endDate])

  function handleExport() {
    if (!data) return

    const headers = ['Section', 'Label', 'Total', 'Breached', 'Breach Rate %']
    const rows: (string | number | null)[][] = []

    // Overall
    rows.push(['Overall', 'Total Tickets', data.overall.total, data.overall.breached,
      data.overall.total > 0
        ? Math.round((data.overall.breached / data.overall.total) * 10000) / 100
        : 0,
    ])
    rows.push(['Overall', 'SLA Met', data.overall.met, null, null])
    rows.push(['Overall', 'At Risk', data.overall.atRisk, null, null])

    // By priority
    for (const r of data.byPriority) {
      rows.push(['By Priority', r.priority, r.total, r.breached, r.breachRate])
    }

    // By client
    for (const r of data.byClient) {
      rows.push([
        'By Client',
        r.clientShortCode ? `${r.clientName} (${r.clientShortCode})` : r.clientName,
        r.total,
        r.breached,
        r.breachRate,
      ])
    }

    downloadCsv(`sla-compliance-${startDate}-${endDate}`, headers, rows)
  }

  const metPct =
    data && data.overall.total > 0
      ? Math.round((data.overall.met / data.overall.total) * 10000) / 100
      : 0
  const breachedPct =
    data && data.overall.total > 0
      ? Math.round((data.overall.breached / data.overall.total) * 10000) / 100
      : 0

  return (
    <div className="space-y-6">
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={({ start, end }) => {
          setStartDate(start)
          setEndDate(end)
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : !data ? (
        <p className="text-sm text-th-text-secondary">No data available.</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="th-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Total Tickets
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
                {data.overall.total}
              </p>
            </div>
            <div className="th-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                SLA Met
              </p>
              <p className="mt-1 text-2xl font-semibold text-green-400 tabular-nums">
                {data.overall.met}
              </p>
              <p className="text-xs text-th-text-secondary tabular-nums">
                {metPct}%
              </p>
            </div>
            <div className="th-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                SLA Breached
              </p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  data.overall.breached > 0 ? 'text-red-400' : 'text-slate-100'
                }`}
              >
                {data.overall.breached}
              </p>
              <p
                className={`text-xs tabular-nums ${
                  data.overall.breached > 0
                    ? 'text-red-400/70'
                    : 'text-th-text-secondary'
                }`}
              >
                {breachedPct}%
              </p>
            </div>
            <div className="th-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                At Risk
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-400 tabular-nums">
                {data.overall.atRisk}
              </p>
            </div>
          </div>

          {/* Export button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-md border border-th-border bg-th-surface px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* By Priority */}
          <div className="th-card overflow-hidden">
            <div className="border-b border-th-border px-4 py-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                By Priority
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-th-border text-left text-xs text-th-text-muted">
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Breached
                    </th>
                    <th className="px-4 py-2 font-medium">Breach Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPriority.map((r) => (
                    <tr
                      key={r.priority}
                      className="border-b border-th-border/50 hover:bg-th-elevated/40"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-200">
                        {r.priority}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-th-text-secondary">
                        {r.total}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          r.breached > 0
                            ? 'text-red-400'
                            : 'text-th-text-secondary'
                        }`}
                      >
                        {r.breached}
                      </td>
                      <td className="px-4 py-2.5">
                        <BreachBar rate={r.breachRate} />
                      </td>
                    </tr>
                  ))}
                  {data.byPriority.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-xs text-th-text-secondary"
                      >
                        No tickets in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* By Client */}
          <div className="th-card overflow-hidden">
            <div className="border-b border-th-border px-4 py-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                By Client
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-th-border text-left text-xs text-th-text-muted">
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Breached
                    </th>
                    <th className="px-4 py-2 font-medium">Breach Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.map((r) => (
                    <tr
                      key={r.clientId}
                      className="border-b border-th-border/50 hover:bg-th-elevated/40"
                    >
                      <td className="px-4 py-2.5 text-slate-200">
                        <span className="font-medium">{r.clientName}</span>
                        {r.clientShortCode && (
                          <span className="ml-1.5 text-xs text-th-text-muted">
                            ({r.clientShortCode})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-th-text-secondary">
                        {r.total}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${
                          r.breached > 0
                            ? 'text-red-400'
                            : 'text-th-text-secondary'
                        }`}
                      >
                        {r.breached}
                      </td>
                      <td className="px-4 py-2.5">
                        <BreachBar rate={r.breachRate} />
                      </td>
                    </tr>
                  ))}
                  {data.byClient.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-xs text-th-text-secondary"
                      >
                        No client data in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
