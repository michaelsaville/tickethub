'use client'

import { useEffect, useRef } from 'react'

/**
 * Background GPS tracker. Pings the server every INTERVAL_MS while
 * the app is open. Runs invisibly — no UI. Mounted in the layout.
 *
 * - Only activates on HTTPS (geolocation requires secure context)
 * - Silently no-ops if the user denies permission
 * - Fire-and-forget POSTs — never blocks the UI
 */

const INTERVAL_MS = 3 * 60_000 // 3 minutes

export function LocationTracker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    // Don't run on localhost dev
    if (
      typeof window !== 'undefined' &&
      window.location.protocol !== 'https:'
    ) {
      return
    }

    function ping() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetch('/api/location/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          }).catch(() => {}) // fire-and-forget
        },
        () => {}, // user denied or timed out — that's fine
        { timeout: 10_000, enableHighAccuracy: false },
      )
    }

    // Initial ping on mount
    ping()

    // Then every INTERVAL_MS
    intervalRef.current = setInterval(ping, INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // No visible UI
  return null
}
