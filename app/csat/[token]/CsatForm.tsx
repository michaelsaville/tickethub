'use client'

import { useState } from 'react'

export function CsatForm({
  token,
  initialScore,
}: {
  token: string
  initialScore: number | null
}) {
  const [score, setScore] = useState<number | null>(initialScore)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!score) {
      setError('Please pick a score from 1 to 5.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/csat/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score, comment: comment.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not save your response.')
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your response.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-900/20 p-6 text-center">
        <div className="mb-3 text-3xl">{'★'.repeat(score ?? 0)}</div>
        <p className="text-sm text-emerald-200">
          Thanks for the feedback &mdash; we've recorded your response.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-6"
    >
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setScore(n)}
            className={`rounded px-4 py-3 text-2xl transition ${
              score && n <= score
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
            }`}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wider text-slate-400">
          Comment (optional)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Anything we should know?"
          className="w-full rounded border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
        />
      </label>

      {error && (
        <div className="rounded border border-red-700/40 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !score}
        className="w-full rounded bg-amber-500 px-4 py-3 font-medium text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Submit response'}
      </button>
    </form>
  )
}
