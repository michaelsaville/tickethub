'use client'

import { useState } from 'react'

interface ReminderData {
  id: string
  title: string
  body: string | null
  actionUrl: string | null
  source: string
  status: string
  recurrence: string
  dueDate: string | null
  nextNotifyAt: string
  notifyCount: number
}

export function PortalView({
  token,
  contactName,
  companyName,
  reminders: initialReminders,
}: {
  token: string
  contactName: string
  companyName: string
  reminders: ReminderData[]
}) {
  const [reminders, setReminders] = useState(initialReminders)
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  async function handleAction(id: string, action: 'acknowledge' | 'snooze') {
    setLoading((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(
        `/api/portal/${token}/reminders/${id}/${action}`,
        { method: 'POST' },
      )
      if (res.ok) {
        setReminders((prev) => prev.filter((r) => r.id !== id))
      }
    } catch {
      // Silently fail
    } finally {
      setLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-mono text-slate-100">
          Hi {contactName},
        </h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          {companyName} — {reminders.length} pending item
          {reminders.length !== 1 ? 's' : ''}
        </p>
      </div>

      {reminders.length === 0 ? (
        <div className="th-card text-center">
          <p className="text-sm text-green-400">
            All caught up — no pending items!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <div key={r.id} className="th-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-200">{r.title}</h3>
                  {r.body && (
                    <p className="mt-1 text-sm text-th-text-secondary whitespace-pre-wrap">
                      {r.body}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-th-text-muted font-mono uppercase">
                    <span>
                      {r.source === 'SYNCRO_ESTIMATE' ? 'Estimate' : 'Reminder'}
                    </span>
                    <span>·</span>
                    <span>{r.recurrence.replace(/_/g, ' ')}</span>
                    {r.notifyCount > 0 && (
                      <>
                        <span>·</span>
                        <span>Sent {r.notifyCount}x</span>
                      </>
                    )}
                  </div>
                </div>
                {r.source === 'SYNCRO_ESTIMATE' && (
                  <span className="flex-none rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-mono uppercase text-blue-400">
                    Estimate
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.actionUrl && (
                  <a
                    href={r.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="th-btn-primary text-xs"
                  >
                    View / Take Action
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleAction(r.id, 'acknowledge')}
                  disabled={loading[r.id]}
                  className="rounded bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                >
                  {loading[r.id] ? '...' : 'Done / Acknowledged'}
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(r.id, 'snooze')}
                  disabled={loading[r.id]}
                  className="rounded bg-th-surface-raised px-3 py-1.5 text-xs font-medium text-th-text-secondary hover:text-accent transition-colors disabled:opacity-50"
                >
                  Snooze 3 Days
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-th-text-muted">
        Questions? Reply to any reminder email or contact PCC2K directly.
      </p>
    </div>
  )
}
