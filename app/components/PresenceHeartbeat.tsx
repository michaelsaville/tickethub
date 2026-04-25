'use client'

import { useEffect } from 'react'

/**
 * Tab-driven presence heartbeat. Pings POST /api/presence/heartbeat
 * every 60s while the tab is foregrounded. Pauses when document is
 * hidden so background tabs don't keep someone "online" forever.
 *
 * Mounted invisibly in the TicketHub layout — no UI.
 */

const HEARTBEAT_MS = 60_000

export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false

    function ping() {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.hidden) return
      fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {})
    }

    ping()
    const id = setInterval(ping, HEARTBEAT_MS)

    function onVisibility() {
      if (!document.hidden) ping()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
