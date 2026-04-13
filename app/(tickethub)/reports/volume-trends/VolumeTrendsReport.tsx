'use client'

import { useEffect, useState, useMemo } from 'react'
import { DateRangePicker } from '@/app/components/reports/DateRangePicker'
import { downloadCsv } from '@/app/lib/csv-export'

type PeriodData = {
  period: string
  created: number
  closed: number
}

type ApiResult = {
  periods: PeriodData[]
  avgFirstResponseHours: number | null
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatPeriodLabel(period: string, granularity: 'weekly' | 'monthly'): string {
  const d = new Date(period)
  if (granularity === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function VolumeTrendsReport() {
  const defaultEnd = new Date()
  const defaultStart = new Date()
  defaultStart.setDate(defaultStart.getDate() - 90)

  const [startDate, setStartDate] = useState(iso(defaultStart))
  const [endDate, setEndDate] = useState(iso(defaultEnd))
  const [granularity, setGranularity] = useState<'weekly' | 'monthly'>('weekly')
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(
      `/api/reports/volume-trends?start=${startDate}&end=${endDate}&granularity=${granularity}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error)
        } else {
          setData(json.data)
        }
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false))
  }, [startDate, endDate, granularity])

  const totals = useMemo(() => {
    if (!data) return { created: 0, closed: 0, net: 0 }
    const created = data.periods.reduce((s, p) => s + p.created, 0)
    const closed = data.periods.reduce((s, p) => s + p.closed, 0)
    return { created, closed, net: created - closed }
  }, [data])

  const maxBar = useMemo(() => {
    if (!data) return 1
    return Math.max(1, ...data.periods.map((p) => Math.max(p.created, p.closed)))
  }, [data])

  function handleCsvExport() {
    if (!data) return
    const headers = ['Period', 'Created', 'Closed', 'Net Change', 'Avg First Response (hrs)']
    const rows = data.periods.map((p) => [
      formatPeriodLabel(p.period, granularity),
      p.created,
      p.closed,
      p.created - p.closed,
      data.avgFirstResponseHours ?? '',
    ])
    downloadCsv(
      `volume-trends-${startDate}-to-${endDate}.csv`,
      headers,
      rows as (string | number | null)[][],
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(r) => {
          setStartDate(r.start)
          setEndDate(r.end)
        }}
      />

      <div className="flex items-center gap-3">
        <div className="flex rounded-md border border-th-border overflow-hidden">
          <button
            type="button"
            onClick={() => setGranularity('weekly')}
            className={`px-3 py-1.5 text-xs font-mono ${
              granularity === 'weekly'
                ? 'bg-accent text-white'
                : 'bg-th-surface text-th-text-secondary hover:bg-th-elevated'
            }`}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setGranularity('monthly')}
            className={`px-3 py-1.5 text-xs font-mono ${
              granularity === 'monthly'
                ? 'bg-accent text-white'
                : 'bg-th-surface text-th-text-secondary hover:bg-th-elevated'
            }`}
          >
            Monthly
          </button>
        </div>

        <button
          type="button"
          onClick={handleCsvExport}
          disabled={!data || data.periods.length === 0}
          className="ml-auto rounded-md border border-th-border bg-th-surface px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-slate-100">
            {loading ? '--' : totals.created}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Total Created
          </div>
        </div>
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-green-400">
            {loading ? '--' : totals.closed}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Total Closed
          </div>
        </div>
        <div className="th-card text-center">
          <div
            className={`text-2xl font-mono ${
              loading
                ? 'text-slate-100'
                : totals.net > 0
                  ? 'text-red-400'
                  : totals.net < 0
                    ? 'text-green-400'
                    : 'text-slate-100'
            }`}
          >
            {loading
              ? '--'
              : `${totals.net > 0 ? '+' : ''}${totals.net}`}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Net Change
          </div>
        </div>
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-slate-100">
            {loading
              ? '--'
              : data?.avgFirstResponseHours !== null
                ? `${data?.avgFirstResponseHours}h`
                : 'N/A'}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Avg First Response
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="th-card text-center text-xs text-th-text-muted">
          Loading report...
        </div>
      ) : error ? (
        <div className="th-card border-priority-urgent/40 bg-priority-urgent/5">
          <p className="text-sm text-priority-urgent">{error}</p>
        </div>
      ) : data && data.periods.length === 0 ? (
        <div className="th-card text-center">
          <p className="text-sm text-th-text-secondary">
            No ticket data found for the selected date range.
          </p>
        </div>
      ) : data ? (
        <>
          {/* CSS bar chart */}
          <div className="th-card overflow-x-auto">
            <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted mb-4">
              Created vs Closed per Period
            </p>
            <div className="flex items-end gap-1 min-h-[200px]" style={{ minWidth: data.periods.length * 60 }}>
              {data.periods.map((p) => {
                const createdPct = (p.created / maxBar) * 100
                const closedPct = (p.closed / maxBar) * 100
                const net = p.created - p.closed
                return (
                  <div key={p.period} className="flex-1 min-w-[50px] flex flex-col items-center gap-1">
                    {/* Net indicator line */}
                    <div
                      className={`text-[9px] font-mono ${
                        net > 0 ? 'text-red-400' : net < 0 ? 'text-green-400' : 'text-th-text-muted'
                      }`}
                    >
                      {net > 0 ? '+' : ''}{net}
                    </div>
                    {/* Bars */}
                    <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 160 }}>
                      <div
                        className="w-[40%] rounded-t bg-accent/80"
                        style={{ height: `${Math.max(createdPct, 2)}%` }}
                        title={`Created: ${p.created}`}
                      />
                      <div
                        className="w-[40%] rounded-t bg-green-500/80"
                        style={{ height: `${Math.max(closedPct, 2)}%` }}
                        title={`Closed: ${p.closed}`}
                      />
                    </div>
                    {/* X-axis label */}
                    <div className="text-[9px] font-mono text-th-text-muted text-center leading-tight mt-1">
                      {formatPeriodLabel(p.period, granularity)}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 justify-center">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-accent/80" />
                <span className="text-[10px] text-th-text-secondary">Created</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-sm bg-green-500/80" />
                <span className="text-[10px] text-th-text-secondary">Closed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-red-400">+N</span>
                <span className="text-[10px] text-th-text-secondary">/ </span>
                <span className="text-[10px] font-mono text-green-400">-N</span>
                <span className="text-[10px] text-th-text-secondary">Net backlog</span>
              </div>
            </div>
          </div>

          {/* Data table */}
          <div className="th-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Created</th>
                    <th className="px-3 py-2 text-right">Closed</th>
                    <th className="px-3 py-2 text-right">Net Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-border">
                  {data.periods.map((p) => {
                    const net = p.created - p.closed
                    return (
                      <tr key={p.period} className="hover:bg-th-elevated">
                        <td className="px-3 py-2 text-slate-200">
                          {formatPeriodLabel(p.period, granularity)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-th-text-secondary">
                          {p.created}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-green-400">
                          {p.closed}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono ${
                            net > 0 ? 'text-red-400' : net < 0 ? 'text-green-400' : 'text-th-text-muted'
                          }`}
                        >
                          {net > 0 ? '+' : ''}{net}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-th-elevated font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right text-slate-200">{totals.created}</td>
                    <td className="px-3 py-2 text-right text-green-400">{totals.closed}</td>
                    <td
                      className={`px-3 py-2 text-right ${
                        totals.net > 0 ? 'text-red-400' : totals.net < 0 ? 'text-green-400' : 'text-th-text-muted'
                      }`}
                    >
                      {totals.net > 0 ? '+' : ''}{totals.net}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
