'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  archiveCustomFieldDef,
  createCustomFieldDef,
  unarchiveCustomFieldDef,
  updateCustomFieldDef,
  type CustomFieldDefDTO,
  type CustomFieldOption,
} from '@/app/lib/actions/custom-fields'

const FIELD_TYPES: {
  value: CustomFieldDefDTO['type']
  label: string
  hint: string
}[] = [
  { value: 'TEXT', label: 'Text (single line)', hint: 'Up to 500 chars' },
  { value: 'MULTILINE', label: 'Text (multi-line)', hint: 'Up to 5000 chars' },
  { value: 'NUMBER', label: 'Number', hint: 'Decimal allowed' },
  { value: 'DATE', label: 'Date', hint: 'YYYY-MM-DD' },
  { value: 'BOOLEAN', label: 'Yes / No', hint: 'Checkbox' },
  { value: 'SELECT', label: 'Dropdown', hint: 'Pick from a list' },
  { value: 'URL', label: 'URL', hint: 'Validated link' },
]

export function CustomFieldsList({ defs }: { defs: CustomFieldDefDTO[] }) {
  const [showForm, setShowForm] = useState(false)
  const ticketDefs = useMemo(
    () => defs.filter((d) => d.entity === 'TICKET'),
    [defs],
  )
  const clientDefs = useMemo(
    () => defs.filter((d) => d.entity === 'CLIENT'),
    [defs],
  )

  return (
    <div className="space-y-6">
      {showForm ? (
        <NewFieldForm onClose={() => setShowForm(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="th-btn-primary"
        >
          + New Field
        </button>
      )}

      <Section title="Ticket fields" defs={ticketDefs} />
      <Section title="Client fields" defs={clientDefs} />
    </div>
  )
}

function Section({
  title,
  defs,
}: {
  title: string
  defs: CustomFieldDefDTO[]
}) {
  if (defs.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-th-text-secondary">
          {title}
        </h2>
        <div className="th-card text-sm text-th-text-secondary">
          No fields yet.
        </div>
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-th-text-secondary">
        {title}
      </h2>
      <div className="space-y-2">
        {defs.map((d) => (
          <FieldRow key={d.id} def={d} />
        ))}
      </div>
    </section>
  )
}

function FieldRow({ def }: { def: CustomFieldDefDTO }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(def.label)
  const [helpText, setHelpText] = useState(def.helpText ?? '')
  const [required, setRequired] = useState(def.required)
  const [sortOrder, setSortOrder] = useState(def.sortOrder)
  const [options, setOptions] = useState<CustomFieldOption[]>(def.options)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isArchived = !!def.archivedAt

  function save() {
    setErr(null)
    startTransition(async () => {
      const res = await updateCustomFieldDef({
        id: def.id,
        label,
        helpText: helpText || null,
        required,
        sortOrder,
        ...(def.type === 'SELECT' ? { options } : {}),
      })
      if (!res.ok) setErr(res.error)
      else setEditing(false)
    })
  }

  function toggleArchive() {
    setErr(null)
    startTransition(async () => {
      const res = isArchived
        ? await unarchiveCustomFieldDef(def.id)
        : await archiveCustomFieldDef(def.id)
      if (!res.ok) setErr(res.error)
    })
  }

  if (!editing) {
    return (
      <div
        className={`th-card flex items-start justify-between gap-4 ${
          isArchived ? 'opacity-50' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-slate-100">{def.label}</span>
            <span className="font-mono text-xs text-th-text-secondary">
              {def.key}
            </span>
            <span className="rounded bg-th-elevated px-1.5 py-0.5 text-xs text-th-text-secondary">
              {def.type}
            </span>
            {def.required && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
                required
              </span>
            )}
            {isArchived && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-xs text-rose-300">
                archived
              </span>
            )}
          </div>
          {def.helpText && (
            <p className="mt-1 text-xs text-th-text-secondary">
              {def.helpText}
            </p>
          )}
          {def.type === 'SELECT' && def.options.length > 0 && (
            <p className="mt-1 text-xs text-th-text-secondary">
              Options: {def.options.map((o) => o.label).join(', ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="th-btn-ghost text-xs"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={toggleArchive}
            disabled={isPending}
            className="th-btn-ghost text-xs"
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="th-card space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Label">
          <input
            className="th-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Sort order (lower = first)">
          <input
            type="number"
            className="th-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>
      </div>
      <Field label="Help text">
        <input
          className="th-input"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder="Optional — shown below the field in the editor"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required
      </label>

      {def.type === 'SELECT' && (
        <OptionsEditor options={options} onChange={setOptions} />
      )}

      {err && <p className="text-xs text-rose-400">{err}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="th-btn-ghost"
          disabled={isPending}
        >
          Cancel
        </button>
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

function NewFieldForm({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [entity, setEntity] = useState<CustomFieldDefDTO['entity']>('TICKET')
  const [type, setType] = useState<CustomFieldDefDTO['type']>('TEXT')
  const [helpText, setHelpText] = useState('')
  const [required, setRequired] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)
  const [options, setOptions] = useState<CustomFieldOption[]>([
    { value: '', label: '' },
  ])
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setErr(null)
    startTransition(async () => {
      const res = await createCustomFieldDef({
        key,
        label,
        entity,
        type,
        helpText: helpText || null,
        options: type === 'SELECT' ? options : undefined,
        required,
        sortOrder,
      })
      if (!res.ok) setErr(res.error)
      else onClose()
    })
  }

  // Auto-derive key from label as the user types — until they touch it themselves.
  const [keyDirty, setKeyDirty] = useState(false)
  function handleLabelChange(v: string) {
    setLabel(v)
    if (!keyDirty) {
      setKey(
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 40),
      )
    }
  }

  return (
    <div className="th-card space-y-3">
      <h3 className="font-semibold text-slate-100">New custom field</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Label">
          <input
            className="th-input"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Warranty expires"
          />
        </Field>
        <Field label="Key (machine-readable)">
          <input
            className="th-input font-mono"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setKeyDirty(true)
            }}
            placeholder="warranty_expires"
          />
        </Field>
        <Field label="Applies to">
          <select
            className="th-input"
            value={entity}
            onChange={(e) =>
              setEntity(e.target.value as CustomFieldDefDTO['entity'])
            }
          >
            <option value="TICKET">Tickets</option>
            <option value="CLIENT">Clients</option>
          </select>
        </Field>
        <Field label="Type">
          <select
            className="th-input"
            value={type}
            onChange={(e) =>
              setType(e.target.value as CustomFieldDefDTO['type'])
            }
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Help text">
        <input
          className="th-input"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder="Optional"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          Sort order
          <input
            type="number"
            className="th-input w-24"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </label>
      </div>

      {type === 'SELECT' && (
        <OptionsEditor options={options} onChange={setOptions} />
      )}

      {err && <p className="text-xs text-rose-400">{err}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="th-btn-ghost"
          disabled={isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="th-btn-primary"
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: CustomFieldOption[]
  onChange: (next: CustomFieldOption[]) => void
}) {
  function update(i: number, patch: Partial<CustomFieldOption>) {
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  }
  function remove(i: number) {
    onChange(options.filter((_, idx) => idx !== i))
  }
  function add() {
    onChange([...options, { value: '', label: '' }])
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-th-text-secondary">
        Options
      </div>
      {options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="th-input flex-1 font-mono"
            value={o.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="value"
          />
          <input
            className="th-input flex-1"
            value={o.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Display label"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="th-btn-ghost text-xs"
            aria-label="Remove option"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="th-btn-ghost text-xs">
        + Add option
      </button>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-th-text-secondary">
        {label}
      </span>
      {children}
    </label>
  )
}
