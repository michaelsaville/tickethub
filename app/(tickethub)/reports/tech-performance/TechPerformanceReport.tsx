'use client'

import { useEffect, useState, useCallback } from 'react'
import { DateRangePicker } from '@/app/components/reports/DateRangePicker'
import { downloadCsv } from '@/app/lib/csv-export'

type Tech = { id: string; name: string }

type TechRow = {
  id: string
  name: string
  ticketsClosed: number
  avgResolutionHours: number
  laborMinutes: number
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Count weekdays between two YYYY-MM-DD date strings (inclusive). */
function countWeekdays(startStr: string, endStr: string): number {
  const start = new Date(startStr + 'T00:00:00')
  const end = new Date(endStr + 'T00:00:00')
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export function TechPerformanceReport({ techs: _techs }: { techs: Tech[] }) {
  const today = new Date()
  const thirtyAgo = new Date(today)
  thirtyAgo.setDate(thirtyAgo.getDate() - 29)

  const [startDate, setStartDate] = useState(iso(thirtyAgo))
  const [endDate, setEndDate] = useState(iso(today))
  const [data, setData] = useState<TechRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/reports/tech-performance?start=${startDate}&end=${endDate}`,
      )
      const json = await res.json()
      if (json.data) setData(json.data.techs)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const weekdays = countWeekdays(startDate, endDate)
  const availableHours = weekdays * 8

  // Summary stats
  const totalClosed = data.reduce((s, t) => s + t.ticketsClosed, 0)
  const totalLaborMin = data.reduce((s, t) => s + t.laborMinutes, 0)
  const avgResolution =
    data.length > 0
      ? Math.round(
          (data.reduce((s, t) => s + t.avgResolutionHours * t.ticketsClosed, 0) /
            Math.max(totalClosed, 1)) *
            10,
        ) / 10
      : 0

  const maxTickets = Math.max(...data.map((t) => t.ticketsClosed), 1)

  function handleExport() {
    const headers = [
      'Tech Name',
      'Tickets Closed',
      'Avg Resolution (hrs)',
      'Labor Hours',
      'Utilization %',
    ]
    const rows = data.map((t) => {
      const laborHrs = Math.round((t.laborMinutes / 60) * 10) / 10
      const util =
        availableHours > 0
          ? Math.round((laborHrs / availableHours) * 1000) / 10
          : 0
      return [t.name, t.ticketsClosed, t.avgResolutionHours, laborHrs, util]
    })
    downloadCsv(`tech-performance-${startDate}-to-${endDate}`, headers, rows)
  }

  return (
    <div className="space-y-6">
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(r) => {
          setStartDate(r.start)
          setEndDate(r.end)
        }}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="th-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Total Tickets Closed
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {loading ? '...' : totalClosed}
          </p>
        </div>
        <div className="th-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Avg Resolution Time
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {loading ? '...' : `${avgResolution}h`}
          </p>
        </div>
        <div className="th-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Total Labor Hours
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {loading ? '...' : `${Math.round((totalLaborMin / 60) * 10) / 10}h`}
          </p>
        </div>
      </div>

      {/* Bar Chart - Tickets Closed per Tech */}
      {!loading && data.length > 0 && (
        <div className="th-card p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted mb-3">
            Tickets Closed by Tech
          </p>
          <div className="space-y-1.5">
            {data.map((t) => {
              const pct = (t.ticketsClosed / maxTickets) * 100
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-36 truncate text-xs text-slate-200">
                    {t.name}
                  </span>
                  <div className="flex-1 h-5 rounded bg-th-surface-raised overflow-hidden">
                    <div
                      className="h-full bg-accent/60 rounded"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-xs text-th-text-muted">
                    {t.ticketsClosed}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          disabled={loading || data.length === 0}
          className="th-btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="th-card p-8 text-center text-sm text-th-text-secondary">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
          Loading performance data...
        </div>
      ) : data.length === 0 ? (
        <div className="th-card p-8 text-center text-sm text-th-text-secondary">
          No data for this date range.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-th-border">
          <table className="w-full text-xs">
            <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              <tr>
                <th className="px-3 py-2">Tech Name</th>
                <th className="px-3 py-2 text-right">Tickets Closed</th>
                <th className="px-3 py-2 text-right">Avg Resolution (hrs)</th>
                <th className="px-3 py-2 text-right">Labor Hours</th>
                <th className="px-3 py-2 text-right">Utilization %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-th-border">
              {data.map((t) => {
                const laborHrs =
                  Math.round((t.laborMinutes / 60) * 10) / 10
                const util =
                  availableHours > 0
                    ? Math.round((laborHrs / availableHours) * 1000) / 10
                    : 0
                return (
                  <tr key={t.id} className="hover:bg-th-elevated">
                    <td className="px-3 py-2 text-slate-200">{t.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-th-text-muted">
                      {t.ticketsClosed}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-th-text-muted">
                      {t.avgResolutionHours}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-th-text-muted">
                      {laborHrs}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-th-text-muted">
                      {util}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
