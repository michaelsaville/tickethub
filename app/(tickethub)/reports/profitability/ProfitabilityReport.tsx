'use client'

import { useEffect, useState, useCallback } from 'react'
import { DateRangePicker } from '@/app/components/reports/DateRangePicker'
import { downloadCsv } from '@/app/lib/csv-export'
import { formatCents } from '@/app/lib/billing'

type GroupBy = 'client' | 'contract' | 'tech'

interface Row {
  id: string
  name: string
  revenue: number
  laborCost: number
  partsCost: number
}

interface ReportData {
  summary: { revenue: number; laborCost: number; partsCost: number }
  rows: Row[]
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pct(margin: number, revenue: number): string {
  if (revenue === 0) return '--'
  return ((margin / revenue) * 100).toFixed(1) + '%'
}

export function ProfitabilityReport() {
  const now = new Date()
  const thirtyAgo = new Date(now)
  thirtyAgo.setDate(thirtyAgo.getDate() - 29)

  const [startDate, setStartDate] = useState(iso(thirtyAgo))
  const [endDate, setEndDate] = useState(iso(now))
  const [groupBy, setGroupBy] = useState<GroupBy>('client')
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch(
      `/api/reports/profitability?start=${startDate}&end=${endDate}&groupBy=${groupBy}`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (json.summary) setData(json)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [startDate, endDate, groupBy])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const maxRevenue = data
    ? Math.max(...data.rows.map((r) => r.revenue), 1)
    : 1

  const handleExport = () => {
    if (!data) return
    const label = groupBy === 'client' ? 'Client' : groupBy === 'contract' ? 'Contract' : 'Technician'
    const headers = [label, 'Revenue', 'Labor Cost', 'Parts Cost', 'Margin', 'Margin %']
    const rows = data.rows.map((r) => {
      const totalCost = r.laborCost + r.partsCost
      const margin = r.revenue - totalCost
      return [
        r.name,
        (r.revenue / 100).toFixed(2),
        (r.laborCost / 100).toFixed(2),
        (r.partsCost / 100).toFixed(2),
        (margin / 100).toFixed(2),
        pct(margin, r.revenue),
      ]
    })
    downloadCsv(`profitability-${groupBy}-${startDate}-${endDate}`, headers, rows)
  }

  const summary = data?.summary
  const totalCost = summary ? summary.laborCost + summary.partsCost : 0
  const totalMargin = summary ? summary.revenue - totalCost : 0

  const groupTabs: { key: GroupBy; label: string }[] = [
    { key: 'client', label: 'By Client' },
    { key: 'contract', label: 'By Contract' },
    { key: 'tech', label: 'By Tech' },
  ]

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

      {/* Group toggle */}
      <div className="flex items-center gap-2">
        {groupTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setGroupBy(t.key)}
            className={
              groupBy === t.key
                ? 'th-btn-primary px-3 py-1.5 text-xs'
                : 'rounded-md border border-th-border bg-th-surface px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated'
            }
          >
            {t.label}
          </button>
        ))}

        <div className="ml-auto">
          <button
            type="button"
            onClick={handleExport}
            disabled={!data || data.rows.length === 0}
            className="rounded-md border border-th-border bg-th-surface px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="th-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Total Revenue
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-100">
              {formatCents(summary.revenue)}
            </p>
          </div>
          <div className="th-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Labor Cost
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-100">
              {formatCents(summary.laborCost)}
            </p>
          </div>
          <div className="th-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Parts Cost
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-100">
              {formatCents(summary.partsCost)}
            </p>
          </div>
          <div className="th-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Margin
            </p>
            <p
              className={`mt-1 text-xl font-semibold ${
                totalMargin >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatCents(totalMargin)}{' '}
              <span className="text-sm font-normal text-th-text-secondary">
                ({pct(totalMargin, summary.revenue)})
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-th-text-secondary">
          Loading...
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-th-text-secondary">
          No billable charges found for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-th-border text-left">
                <th className="pb-2 pr-4 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  {groupBy === 'client'
                    ? 'Client'
                    : groupBy === 'contract'
                      ? 'Contract'
                      : 'Technician'}
                </th>
                <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Revenue
                </th>
                <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Labor Cost
                </th>
                <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Parts Cost
                </th>
                <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Margin
                </th>
                <th className="pb-2 pr-4 text-right font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Margin %
                </th>
                <th className="pb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const cost = row.laborCost + row.partsCost
                const margin = row.revenue - cost
                const barWidth = (row.revenue / maxRevenue) * 100
                return (
                  <tr
                    key={row.id}
                    className="border-b border-th-border/50 hover:bg-th-elevated/30"
                  >
                    <td className="py-2.5 pr-4 text-slate-200">
                      {row.name}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-200">
                      {formatCents(row.revenue)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">
                      {formatCents(row.laborCost)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">
                      {formatCents(row.partsCost)}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right tabular-nums ${
                        margin >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {formatCents(margin)}
                    </td>
                    <td
                      className={`py-2.5 pr-4 text-right tabular-nums ${
                        margin >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {pct(margin, row.revenue)}
                    </td>
                    <td className="py-2.5" style={{ minWidth: 120 }}>
                      <div className="h-3 w-full rounded-full bg-th-surface">
                        <div
                          className="h-3 rounded-full bg-accent/60"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
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
