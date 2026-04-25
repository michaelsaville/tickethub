'use client'

import { useEffect, useState } from 'react'
import { statusFromHeartbeat, type PresenceStatus } from '@/app/lib/presence'

type PresenceMap = Record<
  string,
  { status: PresenceStatus; lastHeartbeatAt: string | null }
>

let cache: PresenceMap | null = null
let cacheAt = 0
let inflight: Promise<PresenceMap> | null = null
const CACHE_TTL_MS = 30_000

async function fetchPresence(): Promise<PresenceMap> {
  if (cache && Date.now() - cacheAt < CACHE_TTL_MS) return cache
  if (inflight) return inflight
  inflight = fetch('/api/presence', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((m: PresenceMap) => {
      cache = m
      cacheAt = Date.now()
      inflight = null
      return m
    })
    .catch(() => {
      inflight = null
      return cache ?? {}
    })
  return inflight
}

const POLL_MS = 60_000

/**
 * Renders a colored dot showing whether a user is active in TicketHub
 * right now. Polls /api/presence every 60s; multiple dots on the same
 * page share one fetch via the module-level cache.
 *
 * Initial render uses the optional `initialHeartbeat` (server-rendered
 * timestamp) so the first paint isn't always "away".
 */
export function PresenceDot({
  userId,
  initialHeartbeat,
  size = 8,
  withLabel = false,
  className,
}: {
  userId: string
  initialHeartbeat?: string | null
  size?: number
  withLabel?: boolean
  className?: string
}) {
  const [status, setStatus] = useState<PresenceStatus>(() =>
    statusFromHeartbeat(initialHeartbeat ?? null),
  )

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const map = await fetchPresence()
      if (cancelled) return
      const entry = map[userId]
      if (entry) setStatus(entry.status)
      else setStatus('away')
    }
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [userId])

  const colors: Record<PresenceStatus, string> = {
    active: 'bg-emerald-400 ring-emerald-400/40',
    idle: 'bg-amber-400 ring-amber-400/40',
    away: 'bg-slate-600 ring-slate-600/40',
  }
  const titles: Record<PresenceStatus, string> = {
    active: 'Active in TicketHub',
    idle: 'Idle (last seen 1–5 min ago)',
    away: 'Away',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 ${className ?? ''}`}
      title={titles[status]}
    >
      <span
        aria-hidden
        className={`inline-block rounded-full ring-1 ${colors[status]}`}
        style={{ width: size, height: size }}
      />
      {withLabel && (
        <span className="text-[10px] uppercase tracking-wider text-th-text-muted">
          {status}
        </span>
      )}
    </span>
  )
}
