'use client'

import { useState } from 'react'

interface Props {
  ticketId: string
}

interface Suggestion {
  steps: string[]
  similarTicketNumbers: number[]
  confidence: 'high' | 'medium' | 'low'
}

export function SuggestedResolution({ ticketId }: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSuggest() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/suggest-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setSuggestion(json.data)
      }
    } catch {
      setError('Failed to get suggestions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="th-card">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          AI Resolution Steps
        </div>
        {suggestion && (
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              suggestion.confidence === 'high'
                ? 'bg-green-500/20 text-green-400'
                : suggestion.confidence === 'medium'
                  ? 'bg-accent/20 text-accent'
                  : 'bg-th-surface-raised text-th-text-muted'
            }`}
          >
            {suggestion.confidence}
          </span>
        )}
      </div>

      {!suggestion && !loading && !error && (
        <button
          type="button"
          onClick={handleSuggest}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded bg-th-surface-raised px-3 py-2 text-xs font-medium text-th-text-secondary hover:bg-th-surface-raised/80 hover:text-accent transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
          Suggest Resolution Steps
        </button>
      )}

      {loading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-th-text-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Analyzing ticket and searching history...
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-priority-urgent">{error}</p>
      )}

      {suggestion && (
        <div className="mt-2">
          <ol className="space-y-1.5 text-xs">
            {suggestion.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-none font-mono text-accent">
                  {i + 1}.
                </span>
                <span className="text-slate-200">{step}</span>
              </li>
            ))}
          </ol>
          {suggestion.similarTicketNumbers.length > 0 && (
            <p className="mt-2 text-[10px] text-th-text-muted">
              Based on tickets:{' '}
              {suggestion.similarTicketNumbers.map((n) => `#${n}`).join(', ')}
            </p>
          )}
          <button
            type="button"
            onClick={handleSuggest}
            className="mt-2 text-[10px] text-th-text-muted hover:text-accent"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  )
}
