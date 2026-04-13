'use client'

import { useEffect, useState } from 'react'
import { DateRangePicker } from '@/app/components/reports/DateRangePicker'
import { downloadCsv } from '@/app/lib/csv-export'

interface Client {
  id: string
  name: string
  shortCode: string | null
}

interface StatusRow { status: string; count: number }
interface PriorityRow { priority: string; count: number }
interface TypeRow { type: string; count: number }
interface CategoryRow { type: string; count: number }
interface TicketRow {
  ticketNumber: number
  title: string
  priority: string
  status: string
  type: string
  createdAt: string
  closedAt: string | null
  assignee: string
}

interface QbrData {
  client: { name: string; shortCode: string | null }
  period: { start: string; end: string }
  tickets: {
    total: number
    resolved: number
    byStatus: StatusRow[]
    byPriority: PriorityRow[]
    byType: TypeRow[]
    topCategories: CategoryRow[]
  }
  sla: {
    total: number
    met: number
    breached: number
    complianceRate: number
  }
  performance: {
    avgResolutionHours: number
    avgFirstResponseHours: number | null
  }
  billing: {
    totalRevenueCents: number
    totalLaborMinutes: number
    totalChargedMinutes: number
    revenueByType: Record<string, number>
  }
  recentTickets: TicketRow[]
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'text-red-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-blue-400',
  LOW: 'text-slate-400',
}

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/20 text-blue-300',
  OPEN: 'bg-blue-600/20 text-blue-300',
  IN_PROGRESS: 'bg-amber-500/20 text-amber-300',
  WAITING_CUSTOMER: 'bg-purple-500/20 text-purple-300',
  WAITING_THIRD_PARTY: 'bg-purple-500/20 text-purple-300',
  RESOLVED: 'bg-emerald-500/20 text-emerald-300',
  CLOSED: 'bg-slate-500/20 text-slate-400',
  CANCELLED: 'bg-slate-600/20 text-slate-500',
}

export function ClientQbrReport({ clients }: { clients: Client[] }) {
  const now = new Date()
  const thirtyAgo = new Date(now)
  thirtyAgo.setDate(thirtyAgo.getDate() - 29)

  const [clientId, setClientId] = useState('')
  const [startDate, setStartDate] = useState(iso(thirtyAgo))
  const [endDate, setEndDate] = useState(iso(now))
  const [data, setData] = useState<QbrData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientId) { setData(null); return }
    setLoading(true)
    fetch(`/api/reports/client-qbr?clientId=${clientId}&start=${startDate}&end=${endDate}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setData(json.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId, startDate, endDate])

  function handleExportCsv() {
    if (!data) return
    const headers = ['Ticket #', 'Title', 'Priority', 'Status', 'Type', 'Created', 'Closed', 'Assignee']
    const rows = data.recentTickets.map((t) => [
      t.ticketNumber,
      t.title,
      t.priority,
      t.status,
      t.type,
      t.createdAt.slice(0, 10),
      t.closedAt?.slice(0, 10) ?? '',
      t.assignee,
    ])
    downloadCsv(`qbr-${data.client.shortCode ?? 'client'}-${startDate}-${endDate}.csv`, headers, rows)
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Client
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="th-input w-full text-sm"
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.shortCode ? ` (${c.shortCode})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={({ start, end }) => { setStartDate(start); setEndDate(end) }}
      />

      {!clientId && (
        <p className="py-12 text-center text-sm text-slate-500">
          Select a client above to generate a report.
        </p>
      )}

      {loading && (
        <p className="py-12 text-center text-sm text-slate-400 animate-pulse">
          Loading report...
        </p>
      )}

      {data && !loading && (
        <>
          {/* Report header */}
          <div className="th-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-xl text-slate-100">
                  {data.client.name}
                </h2>
                <p className="text-sm text-th-text-secondary">
                  Service Report: {new Date(data.period.start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – {new Date(data.period.end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleExportCsv}
                  className="rounded border border-th-border px-3 py-1.5 text-xs text-slate-300 hover:bg-th-elevated"
                >
                  CSV
                </button>
                <a
                  href={`/api/reports/client-qbr/pdf?clientId=${clientId}&start=${startDate}&end=${endDate}`}
                  target="_blank"
                  rel="noopener"
                  className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
                >
                  Download PDF
                </a>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Tickets"
              value={String(data.tickets.total)}
              sub={`${data.tickets.resolved} resolved`}
            />
            <StatCard
              label="SLA Compliance"
              value={`${data.sla.complianceRate}%`}
              sub={`${data.sla.breached} breached`}
              accent={data.sla.complianceRate >= 95 ? 'text-emerald-400' : data.sla.complianceRate >= 80 ? 'text-amber-400' : 'text-red-400'}
            />
            <StatCard
              label="Avg Resolution"
              value={`${data.performance.avgResolutionHours}h`}
              sub={data.performance.avgFirstResponseHours != null ? `First response: ${data.performance.avgFirstResponseHours}h` : undefined}
            />
            <StatCard
              label="Total Billed"
              value={formatCents(data.billing.totalRevenueCents)}
              sub={`${formatHours(data.billing.totalChargedMinutes)} labor`}
            />
          </div>

          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* By Priority */}
            <div className="th-card p-4">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
                By Priority
              </h3>
              <div className="space-y-2">
                {data.tickets.byPriority
                  .sort((a, b) => {
                    const order = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
                    return order.indexOf(a.priority) - order.indexOf(b.priority)
                  })
                  .map((r) => (
                    <div key={r.priority} className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${PRIORITY_COLORS[r.priority] ?? 'text-slate-300'}`}>
                        {r.priority}
                      </span>
                      <span className="font-mono text-sm text-slate-300">{r.count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* By Type */}
            <div className="th-card p-4">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
                By Type
              </h3>
              <div className="space-y-2">
                {data.tickets.byType.map((r) => (
                  <div key={r.type} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{r.type.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-sm text-slate-300">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Revenue by charge type */}
            <div className="th-card p-4">
              <h3 className="mb-3 font-mono text-xs uppercase tracking-wider text-th-text-muted">
                Revenue Breakdown
              </h3>
              <div className="space-y-2">
                {Object.entries(data.billing.revenueByType).map(([type, cents]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{type}</span>
                    <span className="font-mono text-sm text-slate-300">{formatCents(cents)}</span>
                  </div>
                ))}
                {Object.keys(data.billing.revenueByType).length === 0 && (
                  <p className="text-sm text-slate-500">No charges in period</p>
                )}
              </div>
            </div>
          </div>

          {/* Recent tickets table */}
          <div className="th-card overflow-hidden">
            <div className="px-4 py-3 border-b border-th-border">
              <h3 className="font-mono text-xs uppercase tracking-wider text-th-text-muted">
                Ticket Details ({data.recentTickets.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-th-border text-left text-th-text-muted">
                    <th className="px-4 py-2 font-mono text-xs">#</th>
                    <th className="px-4 py-2 font-mono text-xs">Title</th>
                    <th className="px-4 py-2 font-mono text-xs">Priority</th>
                    <th className="px-4 py-2 font-mono text-xs">Status</th>
                    <th className="px-4 py-2 font-mono text-xs">Assignee</th>
                    <th className="px-4 py-2 font-mono text-xs">Created</th>
                    <th className="px-4 py-2 font-mono text-xs">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTickets.map((t) => (
                    <tr key={t.ticketNumber} className="border-b border-th-border/30 hover:bg-th-elevated/50">
                      <td className="px-4 py-2 font-mono text-slate-400">{t.ticketNumber}</td>
                      <td className="px-4 py-2 text-slate-200 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? ''}`}>
                          {t.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{t.assignee}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">
                        {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">
                        {t.closedAt ? new Date(t.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.recentTickets.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No tickets in this period
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

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="th-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${accent ?? 'text-slate-100'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-th-text-secondary">{sub}</p>}
    </div>
  )
}
