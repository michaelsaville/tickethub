'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isTimerLocallyStopped } from '@/app/lib/offline-db'
import { subscribeQueue } from '@/app/lib/sync-queue'

interface TimerBarProps {
  initial: {
    ticketId: string
    ticketNumber: number
    ticketTitle: string
    startedAtMs: number
    pausedAtMs: number | null
    pausedMs: number
  } | null
}

export function TimerBar({ initial }: TimerBarProps) {
  const [now, setNow] = useState<number>(() => Date.now())
  const [ghostHidden, setGhostHidden] = useState(false)

  useEffect(() => {
    if (!initial) return
    const h = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(h)
  }, [initial])

  // If the active timer was stopped locally while offline, suppress the
  // bar until the LOG_TIME op flushes (flushQueue clears the marker on
  // success or drop).
  useEffect(() => {
    if (!initial) {
      setGhostHidden(false)
      return
    }
    let cancelled = false
    const check = () => {
      isTimerLocallyStopped(initial.ticketId)
        .then((v) => {
          if (!cancelled) setGhostHidden(v)
        })
        .catch(() => {})
    }
    check()
    const unsub = subscribeQueue(check)
    return () => {
      cancelled = true
      unsub()
    }
  }, [initial])

  if (!initial || ghostHidden) return null

  const totalMs = initial.pausedAtMs
    ? initial.pausedAtMs - initial.startedAtMs - initial.pausedMs
    : now - initial.startedAtMs - initial.pausedMs
  const elapsed = Math.max(0, totalMs)

  const isPaused = initial.pausedAtMs !== null

  return (
    <Link
      href={`/tickets/${initial.ticketId}`}
      className={
        isPaused
          ? 'flex items-center gap-3 border-b border-th-border bg-th-elevated px-4 py-2 transition-colors hover:bg-th-border'
          : 'flex items-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2 transition-colors hover:bg-accent/20'
      }
    >
      <span
        className={
          isPaused
            ? 'h-2 w-2 rounded-full bg-th-text-muted'
            : 'h-2 w-2 rounded-full bg-accent animate-pulse'
        }
      />
      <span className="font-mono text-xs text-accent">
        {isPaused ? 'PAUSED' : 'RUNNING'}
      </span>
      <span className="font-mono text-sm text-slate-100">
        {formatElapsed(elapsed)}
      </span>
      <span className="flex-1 truncate text-xs text-th-text-secondary">
        <span className="font-mono text-th-text-muted">
          #{initial.ticketNumber}
        </span>{' '}
        {initial.ticketTitle}
      </span>
      <span className="text-xs text-th-text-muted">Open ticket →</span>
    </Link>
  )
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
