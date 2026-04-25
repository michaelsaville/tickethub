'use client'

import type { MentionUserDTO } from '@/app/lib/actions/mentions'

export function MentionPicker({
  users,
  highlightIndex,
  onSelect,
  onHover,
  loading,
}: {
  users: MentionUserDTO[]
  highlightIndex: number
  onSelect: (user: MentionUserDTO) => void
  onHover: (index: number) => void
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-2 rounded-md border border-th-border bg-th-elevated px-3 py-2 text-xs text-th-text-muted">
        Loading users…
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-th-border bg-th-elevated px-3 py-2 text-xs text-th-text-muted">
        No users match.
      </div>
    )
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-accent/40 bg-th-elevated shadow-lg">
      <div className="border-b border-th-border bg-th-base/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Mention a teammate — ↑↓ to navigate, Enter to insert, Esc to cancel
      </div>
      <ul>
        {users.map((u, i) => {
          const active = i === highlightIndex
          return (
            <li
              key={u.id}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(u)
              }}
              onMouseEnter={() => onHover(i)}
              className={
                active
                  ? 'cursor-pointer border-l-2 border-accent bg-accent/10 px-3 py-2'
                  : 'cursor-pointer border-l-2 border-transparent px-3 py-2 hover:bg-accent/5'
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-100">@{u.name}</span>
                <span className="ml-auto font-mono text-[10px] text-th-text-muted">
                  {u.email}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
