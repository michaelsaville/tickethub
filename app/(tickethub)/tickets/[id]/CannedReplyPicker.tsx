'use client'

import type { CannedReplyDTO } from '@/app/lib/actions/canned-replies'

export function CannedReplyPicker({
  replies,
  highlightIndex,
  onSelect,
  onHover,
  loading,
}: {
  replies: CannedReplyDTO[]
  highlightIndex: number
  onSelect: (reply: CannedReplyDTO) => void
  onHover: (index: number) => void
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-2 rounded-md border border-th-border bg-th-elevated px-3 py-2 text-xs text-th-text-muted">
        Loading saved replies…
      </div>
    )
  }

  if (replies.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-th-border bg-th-elevated px-3 py-2 text-xs text-th-text-muted">
        No saved replies match.{' '}
        <a
          href="/settings/canned-replies"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Create one →
        </a>
      </div>
    )
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-accent/40 bg-th-elevated shadow-lg">
      <div className="border-b border-th-border bg-th-base/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Saved replies — ↑↓ to navigate, Enter to insert, Esc to cancel
      </div>
      <ul>
        {replies.map((r, i) => {
          const active = i === highlightIndex
          return (
            <li
              key={r.id}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(r)
              }}
              onMouseEnter={() => onHover(i)}
              className={
                active
                  ? 'cursor-pointer border-l-2 border-accent bg-accent/10 px-3 py-2'
                  : 'cursor-pointer border-l-2 border-transparent px-3 py-2 hover:bg-accent/5'
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-accent">/{r.key}</span>
                <span className="text-sm text-slate-100">{r.title}</span>
                {r.isShared && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                    Shared
                  </span>
                )}
                {r.category && (
                  <span className="rounded-full bg-th-base px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-th-text-muted">
                    {r.category}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-1 whitespace-pre-wrap text-xs text-th-text-secondary">
                {r.body}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
