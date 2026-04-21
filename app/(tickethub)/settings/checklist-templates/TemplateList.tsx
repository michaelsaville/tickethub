'use client'

import { useState, useTransition } from 'react'
import type { TH_ChecklistTemplate } from '@prisma/client'
import type { ChecklistTemplateItem } from '@/app/types/checklist-template'
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
} from '@/app/lib/actions/checklist-templates'

type Template = TH_ChecklistTemplate

interface DraftItem {
  text: string
  estimatedMinutes: string
}

export function TemplateList({ templates }: { templates: Template[] }) {
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {templates.map((t) => (
        <div key={t.id}>
          {editingId === t.id ? (
            <TemplateForm
              initial={t}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <TemplateRow
              template={t}
              onEdit={() => setEditingId(t.id)}
            />
          )}
        </div>
      ))}

      {showNew ? (
        <TemplateForm onDone={() => setShowNew(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="th-btn-primary text-sm"
        >
          + New Template
        </button>
      )}
    </div>
  )
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: Template
  onEdit: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const items = (template.items as unknown as ChecklistTemplateItem[]) ?? []

  function remove() {
    if (!confirm(`Delete template "${template.name}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteChecklistTemplate(template.id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div className="th-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-100">{template.name}</h3>
          {template.description && (
            <p className="mt-0.5 text-xs text-th-text-secondary">
              {template.description}
            </p>
          )}
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          <ul className="mt-1 space-y-0.5">
            {items
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 text-xs text-th-text-secondary"
                >
                  <span className="h-3 w-3 flex-none rounded border border-th-border" />
                  <span>{item.text}</span>
                  {item.estimatedMinutes != null && (
                    <span className="font-mono text-[10px] text-th-text-muted">
                      ({item.estimatedMinutes}m)
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="th-btn-ghost text-xs"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="th-btn-ghost text-xs text-priority-urgent"
          >
            Delete
          </button>
        </div>
      </div>
      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}
    </div>
  )
}

function TemplateForm({
  initial,
  onDone,
}: {
  initial?: Template
  onDone: () => void
}) {
  const existingItems = initial
    ? ((initial.items as unknown as ChecklistTemplateItem[]) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          text: i.text,
          estimatedMinutes: i.estimatedMinutes?.toString() ?? '',
        }))
    : []

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [items, setItems] = useState<DraftItem[]>(
    existingItems.length > 0
      ? existingItems
      : [{ text: '', estimatedMinutes: '' }],
  )
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function addItem() {
    setItems([...items, { text: '', estimatedMinutes: '' }])
  }

  function removeItem(index: number) {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
  }

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    const next = [...items]
    next[index] = { ...next[index], [field]: value }
    setItems(next)
  }

  function submit() {
    setErr(null)
    const mapped = items.map((i) => ({
      text: i.text.trim(),
      estimatedMinutes: i.estimatedMinutes
        ? Number(i.estimatedMinutes)
        : null,
    }))

    startTransition(async () => {
      let res
      if (initial) {
        res = await updateChecklistTemplate(initial.id, {
          name,
          description: description || null,
          items: mapped,
        })
      } else {
        res = await createChecklistTemplate(name, description || null, mapped)
      }
      if (!res.ok) {
        setErr(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="th-card">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-accent">
        {initial ? 'Edit Template' : 'New Template'}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="th-input text-sm"
            placeholder="e.g. New Workstation Setup"
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Description (optional)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="th-input text-sm"
            placeholder="When to use this checklist"
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Checklist Items
          </label>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveItem(i, -1)}
                    disabled={i === 0}
                    className="text-[10px] text-th-text-muted hover:text-accent disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(i, 1)}
                    disabled={i === items.length - 1}
                    className="text-[10px] text-th-text-muted hover:text-accent disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={item.text}
                  onChange={(e) => updateItem(i, 'text', e.target.value)}
                  className="th-input flex-1 text-sm"
                  placeholder={`Step ${i + 1}`}
                />
                <input
                  value={item.estimatedMinutes}
                  onChange={(e) => updateItem(i, 'estimatedMinutes', e.target.value)}
                  type="number"
                  min={1}
                  className="th-input w-20 text-sm font-mono"
                  placeholder="min"
                  title="Estimated minutes"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={items.length <= 1}
                  className="text-th-text-muted hover:text-priority-urgent disabled:opacity-30"
                  title="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-1 text-xs text-accent hover:underline"
          >
            + Add item
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !name.trim()}
          className="th-btn-primary text-sm"
        >
          {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Create Template'}
        </button>
        <button type="button" onClick={onDone} className="th-btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}
