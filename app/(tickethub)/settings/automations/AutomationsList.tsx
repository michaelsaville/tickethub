'use client'

import { useState, useTransition } from 'react'
import { setAutomationFlag } from '@/app/lib/actions/automations'

type FlagKey = string

interface Props {
  snapshot: Record<FlagKey, boolean>
  descriptions: Record<FlagKey, { title: string; description: string }>
}

export function AutomationsList({ snapshot, descriptions }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-th-border bg-th-surface">
      <ul className="divide-y divide-th-border">
        {Object.entries(snapshot).map(([flag, enabled]) => (
          <FlagRow
            key={flag}
            flag={flag}
            initialEnabled={enabled}
            meta={descriptions[flag] ?? { title: flag, description: '' }}
          />
        ))}
      </ul>
    </div>
  )
}

function FlagRow({
  flag,
  initialEnabled,
  meta,
}: {
  flag: string
  initialEnabled: boolean
  meta: { title: string; description: string }
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const prev = enabled
    const next = !enabled
    setEnabled(next)
    setErr(null)
    startTransition(async () => {
      const res = await setAutomationFlag(flag as any, next)
      if (!res.ok) {
        setErr(res.error)
        setEnabled(prev)
      }
    })
  }

  return (
    <li className="flex items-start gap-4 px-4 py-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-100">{meta.title}</div>
        <div className="mt-0.5 text-xs text-th-text-secondary">
          {meta.description}
        </div>
        <div className="mt-1 font-mono text-[10px] text-th-text-muted">
          {flag}
        </div>
        {err && <div className="mt-1 text-xs text-priority-urgent">{err}</div>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={enabled}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-amber-500' : 'bg-th-elevated'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </li>
  )
}
