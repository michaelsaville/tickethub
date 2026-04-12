'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TH_Item } from '@prisma/client'
import {
  cancelTimer,
  pauseResumeTimer,
  startTimer,
} from '@/app/lib/actions/timer'
import { enqueueRequest, subscribeQueue } from '@/app/lib/sync-queue'
import {
  isTimerLocallyStopped,
  markTimerLocallyStopped,
} from '@/app/lib/offline-db'

type Item = Pick<TH_Item, 'id' | 'name' | 'type' | 'code'>

interface TimerState {
  id: string
  ticketId: string
  startedAtMs: number
  pausedAtMs: number | null
  pausedMs: number
}

export function TimerControls({
  ticketId,
  items,
  initial,
}: {
  ticketId: string
  items: Item[]
  initial: TimerState | null
}) {
  const [now, setNow] = useState<number>(() => Date.now())
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [ghostHidden, setGhostHidden] = useState(false)

  useEffect(() => {
    if (!initial) return
    const h = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(h)
  }, [initial])

  // Hide the controls if this ticket's timer was stopped locally while
  // offline — the server row still exists until the LOG_TIME op flushes,
  // but from the user's perspective it's already done.
  useEffect(() => {
    if (!initial || initial.ticketId !== ticketId) {
      setGhostHidden(false)
      return
    }
    let cancelled = false
    const check = () => {
      isTimerLocallyStopped(ticketId)
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
  }, [initial, ticketId])

  const runningOnThisTicket =
    initial?.ticketId === ticketId && !ghostHidden
  const runningElsewhere = initial && initial.ticketId !== ticketId
  const isPaused = initial?.pausedAtMs != null

  const totalMs = initial
    ? initial.pausedAtMs
      ? initial.pausedAtMs - initial.startedAtMs - initial.pausedMs
      : now - initial.startedAtMs - initial.pausedMs
    : 0
  const elapsed = Math.max(0, totalMs)

  function start() {
    setErr(null)
    startTransition(async () => {
      const res = await startTimer(ticketId)
      if (!res.ok) setErr(res.error)
    })
  }

  function toggle() {
    setErr(null)
    startTransition(async () => {
      const res = await pauseResumeTimer()
      if (!res.ok) setErr(res.error)
    })
  }

  function cancel() {
    if (!confirm('Discard this timer without logging a charge?')) return
    setErr(null)
    startTransition(async () => {
      const res = await cancelTimer()
      if (!res.ok) setErr(res.error)
    })
  }

  if (runningElsewhere) {
    return (
      <div className="th-card">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Timer
        </div>
        <p className="text-xs text-th-text-secondary">
          You have a running timer on another ticket. Open it from the timer
          bar at the top to stop or cancel it.
        </p>
      </div>
    )
  }

  if (!runningOnThisTicket) {
    return (
      <div className="th-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Timer
          </div>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={isPending}
          className="th-btn-primary w-full"
        >
          ▶ Start Timer
        </button>
        {err && (
          <div className="mt-2 text-xs text-priority-urgent">{err}</div>
        )}
      </div>
    )
  }

  return (
    <div className="th-card">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Timer
        </div>
        <span
          className={
            isPaused
              ? 'font-mono text-[10px] uppercase tracking-wider text-th-text-muted'
              : 'font-mono text-[10px] uppercase tracking-wider text-accent animate-pulse'
          }
        >
          {isPaused ? 'PAUSED' : 'RUNNING'}
        </span>
      </div>
      <div className="font-mono text-2xl text-slate-100">
        {formatElapsed(elapsed)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={isPending}
          className="th-btn-secondary text-xs flex-1"
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          type="button"
          onClick={() => setShowStopDialog(true)}
          disabled={isPending}
          className="th-btn-primary text-xs flex-1"
        >
          ⏹ Stop & Log
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
          title="Discard without logging a charge"
        >
          ✕
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-priority-urgent">{err}</div>}
      {showStopDialog && (
        <StopDialog
          ticketId={ticketId}
          items={items}
          elapsed={elapsed}
          onClose={() => setShowStopDialog(false)}
        />
      )}
    </div>
  )
}

function StopDialog({
  ticketId,
  items,
  elapsed,
  onClose,
}: {
  ticketId: string
  items: Item[]
  elapsed: number
  onClose: () => void
}) {
  const router = useRouter()
  const laborItems = items.filter((i) => i.type === 'LABOR')
  const [itemId, setItemId] = useState<string>(laborItems[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!itemId) {
      setErr('Pick a labor item')
      return
    }
    setErr(null)
    const durationMinutes = Math.max(1, Math.round(elapsed / 60_000))
    startTransition(async () => {
      try {
        const res = await enqueueRequest({
          type: 'LOG_TIME',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/timer/stop`,
          body: {
            ticketId,
            itemId,
            durationMinutes,
            description,
          },
        })
        if (res.synced) {
          router.refresh()
        } else {
          // Offline — mark this ticket's timer as locally stopped so
          // the TimerBar and TimerControls don't render a phantom
          // running timer until the queue flushes.
          await markTimerLocallyStopped(ticketId, res.clientOpId)
          alert(
            'Saved offline — your charge will be logged when you reconnect.',
          )
        }
        onClose()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="th-card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-mono text-sm uppercase tracking-wider text-accent">
          Stop Timer & Log Charge
        </h2>
        <div className="mb-4 font-mono text-xl text-slate-100">
          {formatElapsed(elapsed)}
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Labor Item
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="th-input"
            >
              {laborItems.length === 0 && (
                <option value="" disabled>
                  No LABOR items — add one in Settings → Items
                </option>
              )}
              {laborItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.code ? ` (${i.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What you worked on"
              className="th-input resize-y"
            />
          </div>
        </div>
        {err && (
          <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !itemId}
            className="th-btn-primary"
          >
            {isPending ? 'Logging…' : 'Log Charge'}
          </button>
        </div>
      </div>
    </div>
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
