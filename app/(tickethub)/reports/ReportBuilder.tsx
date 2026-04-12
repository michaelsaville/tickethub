'use client'

import { useState } from 'react'
import Link from 'next/link'

type TicketRow = {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  type: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
  slaBreached: boolean
  client: { name: string; shortCode: string | null }
  assignedTo: { name: string } | null
}

type SummaryGroup = { label: string; count: number }

type ReportResult =
  | {
      type: 'tickets'
      explanation: string
      columns: string[]
      tickets: TicketRow[]
      count: number
    }
  | {
      type: 'summary'
      explanation: string
      groupBy: string
      groups: SummaryGroup[]
    }

const EXAMPLE_PROMPTS = [
  'Show me all P1 tickets this quarter by client sorted by resolution time',
  'How many tickets per status are there right now?',
  'Tickets with SLA breaches in the last 30 days',
  'Breakdown of ticket volume by priority this month',
  'All unresolved tickets assigned to nobody',
  'Closed tickets last week grouped by client',
]

export function ReportBuilder() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setResult(json.data as ReportResult)
      }
    } catch {
      setError('Report generation failed')
    } finally {
      setLoading(false)
    }
  }

  const totalCount = result?.type === 'summary'
    ? result.groups.reduce((s, g) => s + g.count, 0)
    : null

  return (
    <div className="space-y-6">
      <div className="th-card">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="Describe the report you want..."
            className="th-input flex-1"
            autoFocus
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="th-btn-primary whitespace-nowrap disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating...
              </span>
            ) : (
              'Generate Report'
            )}
          </button>
        </div>

        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted mb-2">
            Try asking:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="rounded bg-th-surface-raised px-2 py-1 text-[11px] text-th-text-secondary hover:bg-th-surface-raised/80 hover:text-accent transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="th-card border-priority-urgent/40 bg-priority-urgent/5">
          <p className="text-sm text-priority-urgent">{error}</p>
        </div>
      )}

      {result && (
        <div className="th-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-th-text-secondary italic">
              {result.explanation}
            </p>
            {result.type === 'tickets' && (
              <span className="text-xs text-th-text-muted">
                {result.count} result{result.count !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {result.type === 'summary' ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted mb-2">
                Grouped by {result.groupBy}
              </div>
              <div className="space-y-1.5">
                {result.groups.map((g) => {
                  const pct = totalCount ? (g.count / totalCount) * 100 : 0
                  return (
                    <div key={g.label} className="flex items-center gap-3">
                      <span className="w-36 truncate text-xs text-slate-200">
                        {g.label.replace(/_/g, ' ')}
                      </span>
                      <div className="flex-1 h-5 rounded bg-th-surface-raised overflow-hidden">
                        <div
                          className="h-full bg-accent/60 rounded"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-xs text-th-text-muted">
                        {g.count}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-right text-xs text-th-text-muted">
                Total: {totalCount}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-th-border">
              <table className="w-full text-xs">
                <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Title</th>
                    <th className="px-2 py-1.5">Client</th>
                    {result.columns.includes('assignee') && (
                      <th className="px-2 py-1.5">Assignee</th>
                    )}
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Priority</th>
                    {result.columns.includes('created') && (
                      <th className="px-2 py-1.5">Created</th>
                    )}
                    {result.columns.includes('closed') && (
                      <th className="px-2 py-1.5">Closed</th>
                    )}
                    {result.columns.includes('slaBreached') && (
                      <th className="px-2 py-1.5">SLA</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-th-border">
                  {result.tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-th-elevated">
                      <td className="px-2 py-1.5 font-mono text-th-text-muted">
                        #{t.ticketNumber}
                      </td>
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/tickets/${t.id}`}
                          className="text-slate-300 hover:text-accent"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        {t.client.shortCode ?? t.client.name}
                      </td>
                      {result.columns.includes('assignee') && (
                        <td className="px-2 py-1.5 text-th-text-secondary">
                          {t.assignedTo?.name ?? 'Unassigned'}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        {t.status.replace(/_/g, ' ')}
                      </td>
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        {t.priority}
                      </td>
                      {result.columns.includes('created') && (
                        <td className="px-2 py-1.5 font-mono text-th-text-muted">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </td>
                      )}
                      {result.columns.includes('closed') && (
                        <td className="px-2 py-1.5 font-mono text-th-text-muted">
                          {t.closedAt
                            ? new Date(t.closedAt).toLocaleDateString()
                            : '—'}
                        </td>
                      )}
                      {result.columns.includes('slaBreached') && (
                        <td className="px-2 py-1.5">
                          {t.slaBreached ? (
                            <span className="text-priority-urgent">Breached</span>
                          ) : (
                            <span className="text-th-text-muted">OK</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
