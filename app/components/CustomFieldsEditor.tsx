'use client'

import { useCallback, useState, useTransition } from 'react'
import {
  setCustomFieldValue,
  type CustomFieldWithValue,
} from '@/app/lib/actions/custom-fields'
import type { TH_CustomFieldEntity } from '@prisma/client'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function CustomFieldsEditor({
  entity,
  entityId,
  fields,
}: {
  entity: TH_CustomFieldEntity
  entityId: string
  fields: CustomFieldWithValue[]
}) {
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <FieldEditor
          key={f.id}
          entity={entity}
          entityId={entityId}
          field={f}
        />
      ))}
    </div>
  )
}

function FieldEditor({
  entity,
  entityId,
  field,
}: {
  entity: TH_CustomFieldEntity
  entityId: string
  field: CustomFieldWithValue
}) {
  const [value, setValue] = useState(field.value ?? '')
  const [state, setState] = useState<SaveState>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const save = useCallback(
    (next: string) => {
      setErr(null)
      setState('saving')
      startTransition(async () => {
        const res = await setCustomFieldValue({
          defId: field.id,
          entity,
          entityId,
          value: next,
        })
        if (res.ok) {
          setState('saved')
          setTimeout(
            () => setState((s) => (s === 'saved' ? 'idle' : s)),
            1500,
          )
        } else {
          setState('error')
          setErr(res.error)
        }
      })
    },
    [entity, entityId, field.id],
  )

  return (
    <div>
      <label className="block">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            {field.label}
            {field.required && <span className="ml-1 text-amber-400">*</span>}
          </span>
          {state === 'saving' && (
            <span className="text-[10px] text-th-text-muted">saving…</span>
          )}
          {state === 'saved' && (
            <span className="text-[10px] text-emerald-400">saved</span>
          )}
        </div>
        <FieldInput
          field={field}
          value={value}
          onChange={setValue}
          onCommit={save}
        />
      </label>
      {field.helpText && (
        <p className="mt-1 text-xs text-th-text-muted">{field.helpText}</p>
      )}
      {err && <p className="mt-1 text-xs text-rose-400">{err}</p>}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  onCommit,
}: {
  field: CustomFieldWithValue
  value: string
  onChange: (v: string) => void
  onCommit: (v: string) => void
}) {
  switch (field.type) {
    case 'MULTILINE':
      return (
        <textarea
          className="th-input min-h-[64px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
          rows={3}
        />
      )
    case 'NUMBER':
      return (
        <input
          type="number"
          step="any"
          className="th-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
        />
      )
    case 'DATE':
      return (
        <input
          type="date"
          className="th-input"
          value={value.length > 10 ? value.slice(0, 10) : value}
          onChange={(e) => {
            onChange(e.target.value)
            onCommit(e.target.value)
          }}
        />
      )
    case 'BOOLEAN':
      return (
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => {
              const next = e.target.checked ? 'true' : 'false'
              onChange(next)
              onCommit(next)
            }}
          />
          <span>{value === 'true' ? 'Yes' : 'No'}</span>
        </label>
      )
    case 'SELECT':
      return (
        <select
          className="th-input"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            onCommit(e.target.value)
          }}
        >
          <option value="">— Select —</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'URL':
      return (
        <input
          type="url"
          className="th-input"
          value={value}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
        />
      )
    case 'TEXT':
    default:
      return (
        <input
          type="text"
          className="th-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit(value)}
        />
      )
  }
}
