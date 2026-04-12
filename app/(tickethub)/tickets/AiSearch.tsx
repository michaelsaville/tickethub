'use client'

import { useState } from 'react'
import Link from 'next/link'

type SearchTicket = {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  createdAt: string
  client: { name: string; shortCode: string | null }
  assignedTo: { name: string } | null
}

export function AiSearch() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    explanation: string
    tickets: SearchTicket[]
    count: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setResult(json.data)
      }
    } catch {
      setError('Search failed')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded bg-th-surface-raised px-3 py-1.5 text-xs font-medium text-th-text-secondary hover:bg-th-surface-raised/80 hover:text-accent transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
        AI Search
      </button>
    )
  }

  return (
    <div className="th-card mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          AI-Powered Search
        </span>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null); setError(null) }}
          className="text-xs text-th-text-muted hover:text-th-text-secondary"
        >
          Close
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder='Try: "VPN issues last month" or "unresolved P1 tickets for Acme"'
          className="th-input flex-1"
          autoFocus
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="th-btn-primary whitespace-nowrap disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-priority-urgent">{error}</p>
      )}

      {result && (
        <div className="mt-3">
          <p className="text-xs text-th-text-secondary italic mb-2">
            {result.explanation} — {result.count} result{result.count !== 1 ? 's' : ''}
          </p>
          {result.tickets.length === 0 ? (
            <p className="text-xs text-th-text-muted">No tickets found.</p>
          ) : (
            <div className="overflow-hidden rounded border border-th-border">
              <table className="w-full text-xs">
                <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Title</th>
                    <th className="px-2 py-1.5">Client</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Priority</th>
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
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        {t.status.replace(/_/g, ' ')}
                      </td>
                      <td className="px-2 py-1.5 text-th-text-secondary">
                        {t.priority}
                      </td>
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
