'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { InvoiceSectionConfig } from '@/app/types/invoice-template'
import { SECTION_META } from '@/app/types/invoice-template'

export function SectionCard({
  section,
  onChange,
}: {
  section: InvoiceSectionConfig
  onChange: (updated: InvoiceSectionConfig) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = SECTION_META[section.id]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function toggleEnabled() {
    onChange({ ...section, enabled: !section.enabled })
  }

  function toggleField(key: string) {
    onChange({
      ...section,
      fields: { ...section.fields, [key]: !section.fields[key] },
    })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-th-border bg-th-surface"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-th-text-muted hover:text-accent active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripIcon />
        </button>

        <button
          type="button"
          onClick={toggleEnabled}
          className={`h-4 w-4 flex-none rounded border ${
            section.enabled
              ? 'border-accent bg-accent/20 text-accent'
              : 'border-th-border'
          }`}
          title={section.enabled ? 'Disable section' : 'Enable section'}
        >
          {section.enabled ? (
            <span className="flex items-center justify-center text-[10px]">
              ✓
            </span>
          ) : null}
        </button>

        <span
          className={`flex-1 text-sm font-medium ${
            section.enabled ? 'text-slate-100' : 'text-th-text-muted line-through'
          }`}
        >
          {meta.label}
        </span>

        {meta.fields.length > 0 && section.enabled && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-th-text-muted hover:text-accent"
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>

      {expanded && section.enabled && meta.fields.length > 0 && (
        <div className="border-t border-th-border px-3 py-2 space-y-1">
          {meta.fields.map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-2 text-xs text-th-text-secondary cursor-pointer hover:text-slate-100"
            >
              <input
                type="checkbox"
                checked={section.fields[f.key] !== false}
                onChange={() => toggleField(f.key)}
                className="rounded border-th-border"
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="flex-none"
    >
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" />
      <circle cx="10" cy="11" r="1.2" />
    </svg>
  )
}
