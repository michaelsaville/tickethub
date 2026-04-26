'use client'

import { useState, useTransition } from 'react'
import {
  resetEnumOverride,
  setEnumOverride,
} from '@/app/lib/actions/enum-overrides'
import type { EnumDisplay, EnumName } from '@/app/lib/enum-overrides'

type Section = {
  name: EnumName
  title: string
  description: string
  values: EnumDisplay[]
}

export function EnumOverridesEditor({ section }: { section: Section }) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-th-text-secondary">
        {section.title}
      </h2>
      <p className="mb-3 max-w-2xl text-xs text-th-text-secondary">
        {section.description}
      </p>
      <div className="space-y-2">
        {section.values.map((d) => (
          <Row key={d.value} enumName={section.name} display={d} />
        ))}
      </div>
    </section>
  )
}

function defaultLabel(v: string): string {
  return v
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function Row({
  enumName,
  display,
}: {
  enumName: EnumName
  display: EnumDisplay
}) {
  const fallback = defaultLabel(display.value)
  // If label === fallback we treat the slot as "no label override".
  const [label, setLabel] = useState(
    display.label === fallback ? '' : display.label,
  )
  const [color, setColor] = useState(display.color ?? '')
  const [hidden, setHidden] = useState(display.hidden)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setErr(null)
    startTransition(async () => {
      const res = await setEnumOverride({
        enumName,
        enumValue: display.value,
        label: label || null,
        color: color || null,
        hidden,
      })
      if (!res.ok) setErr(res.error)
      else setSavedAt(Date.now())
    })
  }

  function reset() {
    setErr(null)
    startTransition(async () => {
      const res = await resetEnumOverride({
        enumName,
        enumValue: display.value,
      })
      if (!res.ok) setErr(res.error)
      else {
        setLabel('')
        setColor('')
        setHidden(false)
        setSavedAt(Date.now())
      }
    })
  }

  const overridden = label !== '' || color !== '' || hidden

  return (
    <div className="th-card flex flex-wrap items-center gap-3">
      <div className="min-w-[140px]">
        <div className="font-mono text-xs text-th-text-secondary">
          {display.value}
        </div>
        <div className="text-xs text-th-text-muted">default: {fallback}</div>
      </div>

      <label className="flex flex-col text-xs">
        <span className="text-th-text-muted">Label override</span>
        <input
          className="th-input min-w-[180px]"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={fallback}
        />
      </label>

      <label className="flex flex-col text-xs">
        <span className="text-th-text-muted">Color</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-9 w-12 cursor-pointer rounded border border-th-border bg-th-base"
            value={color || '#000000'}
            onChange={(e) => setColor(e.target.value)}
          />
          <input
            className="th-input w-28 font-mono"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#aabbcc"
          />
        </div>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.target.checked)}
        />
        Hidden
      </label>

      <div className="ml-auto flex items-center gap-2">
        {savedAt && Date.now() - savedAt < 2000 && (
          <span className="text-xs text-emerald-400">saved</span>
        )}
        {err && <span className="text-xs text-rose-400">{err}</span>}
        {overridden && (
          <button
            type="button"
            onClick={reset}
            disabled={isPending}
            className="th-btn-ghost text-xs"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="th-btn-primary"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
