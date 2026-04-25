'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  listMergeCandidates,
  mergeTickets,
  type MergeCandidate,
} from '@/app/lib/actions/merge-tickets'

export function MergeTicketButton({
  ticketId,
  ticketNumber,
  ticketTitle,
  clientId,
  clientName,
}: {
  ticketId: string
  ticketNumber: number
  ticketTitle: string
  clientId: string
  clientName: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="th-btn-ghost w-full text-left text-xs"
      >
        ⇆ Merge into another ticket…
      </button>
      {open && (
        <MergeModal
          ticketId={ticketId}
          ticketNumber={ticketNumber}
          ticketTitle={ticketTitle}
          clientId={clientId}
          clientName={clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function MergeModal({
  ticketId,
  ticketNumber,
  ticketTitle,
  clientId,
  clientName,
  onClose,
}: {
  ticketId: string
  ticketNumber: number
  ticketTitle: string
  clientId: string
  clientName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [scope, setScope] = useState<'this-client' | 'all'>('this-client')
  const [q, setQ] = useState('')
  const [candidates, setCandidates] = useState<MergeCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<MergeCandidate | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Debounced fetch — refetch whenever scope or query changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(() => {
      listMergeCandidates({
        excludeTicketId: ticketId,
        clientId: scope === 'this-client' ? clientId : undefined,
        q: q.trim() || undefined,
        limit: 20,
      })
        .then((rows) => {
          if (!cancelled) {
            setCandidates(rows)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [ticketId, clientId, scope, q])

  function confirmMerge() {
    if (!target) return
    setErr(null)
    startTransition(async () => {
      const res = await mergeTickets({
        winnerId: target.id,
        loserId: ticketId,
      })
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.replace(`/tickets/${res.winnerId}`)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      <div
        className="th-card w-full max-w-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3
            id="merge-modal-title"
            className="font-mono text-[10px] uppercase tracking-wider text-accent"
          >
            Merge ticket #{ticketNumber}
          </h3>
          <p className="mt-1 text-sm text-th-text-secondary">
            Pick a target ticket. All comments, charges, attachments, parts,
            signatures, appointments, and timeline events will move into the
            target. This ticket (
            <span className="font-mono text-th-text-muted">
              #{ticketNumber} — {ticketTitle}
            </span>
            ) will be soft-deleted, and any future load of its URL will
            redirect to the merged-into ticket.
          </p>
        </div>

        {target ? (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
              Confirm merge
            </div>
            <p className="text-sm text-slate-100">
              Merge <span className="font-mono">#{ticketNumber}</span> into{' '}
              <span className="font-mono">#{target.ticketNumber}</span>?
            </p>
            <div className="rounded border border-th-border bg-th-base p-2 text-xs">
              <div className="font-mono text-th-text-muted">
                #{target.ticketNumber} · {target.status.replace(/_/g, ' ')} ·{' '}
                {target.clientName}
              </div>
              <div className="mt-0.5 text-slate-100">{target.title}</div>
            </div>
            {err && (
              <div className="text-xs text-priority-urgent">{err}</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmMerge}
                disabled={isPending}
                className="th-btn-primary text-sm"
              >
                {isPending
                  ? 'Merging…'
                  : `Merge into #${target.ticketNumber}`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTarget(null)
                  setErr(null)
                }}
                disabled={isPending}
                className="th-btn-ghost text-sm"
              >
                Pick a different target
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="ml-auto th-btn-ghost text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-md border border-th-border bg-th-base p-1 text-xs">
              <button
                type="button"
                onClick={() => setScope('this-client')}
                className={
                  scope === 'this-client'
                    ? 'rounded bg-accent/20 px-3 py-1 text-accent'
                    : 'rounded px-3 py-1 text-th-text-muted hover:text-slate-200'
                }
              >
                Same client ({clientName})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={
                  scope === 'all'
                    ? 'rounded bg-accent/20 px-3 py-1 text-accent'
                    : 'rounded px-3 py-1 text-th-text-muted hover:text-slate-200'
                }
              >
                All clients
              </button>
            </div>

            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by ticket # or title…"
              className="th-input"
              autoFocus
            />

            <div className="max-h-72 overflow-y-auto rounded-md border border-th-border">
              {loading && candidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-th-text-muted">
                  Loading…
                </div>
              ) : candidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-th-text-muted">
                  No matching tickets.
                </div>
              ) : (
                <ul className="divide-y divide-th-border">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setTarget(c)}
                        className="block w-full px-3 py-2 text-left hover:bg-accent/5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-th-text-muted">
                            #{c.ticketNumber}
                          </span>
                          <span className="text-sm text-slate-100">
                            {c.title}
                          </span>
                          <span className="ml-auto rounded-full bg-th-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-th-text-muted">
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-th-text-muted">
                          {c.clientName} · {c.priority}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="th-btn-ghost text-sm"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
