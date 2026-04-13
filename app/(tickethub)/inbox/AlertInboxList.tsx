'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createTicketFromAlert } from '@/app/lib/actions/alert-ticket'

interface DochubAlert {
  id: string
  category: string
  label: string
  sublabel: string | null
  message: string | null
  urgency: string
  expiresAt: string | null
  clientName: string
  dochubClientId: string
}

interface Props {
  clients: Array<{ id: string; name: string; shortCode: string | null }>
  techs: Array<{ id: string; name: string }>
  currentUserId: string
}

const URGENCY_STYLES: Record<string, { label: string; class: string }> = {
  expired: { label: 'Expired', class: 'border-red-500/40 bg-red-500/10 text-red-400' },
  critical: { label: 'Critical', class: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  warning: { label: 'Warning', class: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' },
  upcoming: { label: 'Upcoming', class: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
}

const CATEGORY_ICONS: Record<string, string> = {
  ssl: '🔒', domain: '🌐', warranty: '🛡', credential: '🔑', license: '📜', operational: '⚠️',
}

function daysUntil(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  return `${days}d`
}

export function AlertInboxList({ clients, techs, currentUserId }: Props) {
  const router = useRouter()
  const [alerts, setAlerts] = useState<DochubAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { ticketId?: string; error?: string }>>({})
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setLoading(true)
    fetch('/api/dochub-alerts')
      .then(r => r.json())
      .then(d => setAlerts(d.data ?? []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false))
  }, [])

  function handleCreateTicket(alert: DochubAlert) {
    const priority = alert.urgency === 'expired' || alert.urgency === 'critical' ? 'HIGH' : 'MEDIUM'
    const title = alert.category === 'operational'
      ? `[Alert] ${alert.label}: ${alert.message}`
      : `[${alert.category.toUpperCase()}] ${alert.label} — ${alert.urgency === 'expired' ? 'expired' : 'expiring ' + (alert.expiresAt ? daysUntil(alert.expiresAt) : '')}`
    const description = [
      `Alert Type: ${alert.category}`,
      `Client: ${alert.clientName}`,
      alert.sublabel ? `Details: ${alert.sublabel}` : '',
      alert.expiresAt ? `Expires: ${new Date(alert.expiresAt).toLocaleDateString()}` : '',
      alert.message ? `Message: ${alert.message}` : '',
      `\nSource: DocHub Alert`,
    ].filter(Boolean).join('\n')

    setCreating(alert.id)
    startTransition(async () => {
      const res = await createTicketFromAlert({
        clientName: alert.clientName,
        title,
        description,
        priority: priority as 'HIGH' | 'MEDIUM',
        alertId: alert.id,
      })
      if (res.ok && res.ticketId) {
        setResults(prev => ({ ...prev, [alert.id]: { ticketId: res.ticketId } }))
      } else {
        setResults(prev => ({ ...prev, [alert.id]: { error: res.error ?? 'Failed' } }))
      }
      setCreating(null)
    })
  }

  if (loading) {
    return (
      <div className="th-card text-center text-xs text-th-text-muted py-12 animate-pulse">
        Loading DocHub alerts...
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="th-card text-center text-xs text-th-text-muted">
        No actionable DocHub alerts. Expirations and operational alarms within 30 days will appear here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => {
        const urg = URGENCY_STYLES[alert.urgency] ?? URGENCY_STYLES.upcoming
        const result = results[alert.id]
        const isCreating = creating === alert.id

        return (
          <div key={alert.id} className="th-card">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-violet-300">
                    {CATEGORY_ICONS[alert.category] ?? '📋'} {alert.category}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${urg.class}`}>
                    {urg.label}
                  </span>
                  {alert.expiresAt && (
                    <span className={`font-mono text-[10px] ${alert.urgency === 'expired' ? 'text-red-400' : 'text-th-text-muted'}`}>
                      {daysUntil(alert.expiresAt)}
                    </span>
                  )}
                </div>
                <div className="truncate text-sm text-slate-100">
                  <span className="font-mono text-th-text-muted">{alert.clientName}</span>
                  {' — '}
                  {alert.label}
                </div>
                {(alert.sublabel || alert.message) && (
                  <div className="mt-1 line-clamp-2 text-xs text-th-text-secondary">
                    {alert.message ?? alert.sublabel}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                {result?.ticketId ? (
                  <Link
                    href={`/tickets/${result.ticketId}`}
                    className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300"
                  >
                    → ticket
                  </Link>
                ) : result?.error ? (
                  <span className="text-[10px] text-red-400 max-w-[160px] text-right">
                    {result.error}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateTicket(alert)}
                    disabled={isCreating}
                    className="th-btn-primary text-xs whitespace-nowrap"
                  >
                    {isCreating ? '...' : 'Create Ticket'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
