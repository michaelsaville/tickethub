'use client'

import Link from 'next/link'
import { useState, useTransition, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import type {
  EstimateTemplateConfig,
  EstimateSectionConfig,
} from '@/app/types/estimate-template'
import { saveEstimateTemplateConfig } from '@/app/lib/actions/estimate-template'
import { SectionCard } from './SectionCard'
import { EstimatePreview } from './EstimatePreview'

const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica (Sans-serif)' },
  { value: 'Times-Roman', label: 'Times Roman (Serif)' },
  { value: 'Courier', label: 'Courier (Monospace)' },
] as const

const PAGE_OPTIONS = [
  { value: 'LETTER', label: 'US Letter (8.5" x 11")' },
  { value: 'A4', label: 'A4 (210mm x 297mm)' },
] as const

export function EstimateBuilder({
  initialConfig,
  logoUrl,
}: {
  initialConfig: EstimateTemplateConfig
  logoUrl: string | null
}) {
  const [config, setConfig] = useState<EstimateTemplateConfig>(initialConfig)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const sections = [...config.sections].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sortOrder: i,
    }))

    setConfig({ ...config, sections: reordered })
  }

  const updateSection = useCallback(
    (updated: EstimateSectionConfig) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === updated.id ? updated : s,
        ),
      }))
    },
    [],
  )

  function updateGlobalStyle<K extends keyof EstimateTemplateConfig['globalStyles']>(
    key: K,
    value: EstimateTemplateConfig['globalStyles'][K],
  ) {
    setConfig((prev) => ({
      ...prev,
      globalStyles: { ...prev.globalStyles, [key]: value },
    }))
  }

  function save() {
    setErr(null)
    setSaved(false)
    startTransition(async () => {
      const res = await saveEstimateTemplateConfig(config)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
      <div className="space-y-4">
        <div>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Sections (drag to reorder)
          </h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    onChange={updateSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="th-card space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Global Styles
          </h2>

          <div>
            <label className="mb-1 block text-xs text-th-text-secondary">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.globalStyles.primaryColor}
                onChange={(e) => updateGlobalStyle('primaryColor', e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-th-border bg-transparent"
              />
              <input
                type="text"
                value={config.globalStyles.primaryColor}
                onChange={(e) => updateGlobalStyle('primaryColor', e.target.value)}
                className="th-input w-28 font-mono text-sm"
                placeholder="#3b82f6"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-th-text-secondary">
              Font Family
            </label>
            <select
              value={config.globalStyles.fontFamily}
              onChange={(e) =>
                updateGlobalStyle(
                  'fontFamily',
                  e.target.value as EstimateTemplateConfig['globalStyles']['fontFamily'],
                )
              }
              className="th-input text-sm"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-th-text-secondary">
              Page Size
            </label>
            <select
              value={config.globalStyles.pageSize}
              onChange={(e) =>
                updateGlobalStyle(
                  'pageSize',
                  e.target.value as EstimateTemplateConfig['globalStyles']['pageSize'],
                )
              }
              className="th-input text-sm"
            >
              {PAGE_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="th-card space-y-2">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Logo
          </h2>
          {logoUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 max-w-[160px] object-contain"
              />
              <span className="text-xs text-th-text-muted">
                Shared with invoice template
              </span>
            </div>
          ) : (
            <p className="text-xs text-th-text-secondary">
              No logo uploaded yet.
            </p>
          )}
          <p className="text-xs text-th-text-muted">
            Manage the logo on the{' '}
            <Link href="/settings/invoice-template" className="text-accent underline">
              Invoice Template
            </Link>{' '}
            page — it’s shared across invoices and estimates.
          </p>
        </div>

        {err && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
        {saved && (
          <div className="rounded-md border border-status-resolved/40 bg-status-resolved/10 px-3 py-1.5 text-xs text-status-resolved">
            Template saved successfully
          </div>
        )}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="th-btn-primary text-sm"
        >
          {isPending ? 'Saving…' : 'Save Template'}
        </button>
      </div>

      <div>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Preview
        </h2>
        <div className="rounded-lg border border-th-border bg-gray-100 p-4">
          <EstimatePreview config={config} logoUrl={logoUrl} />
        </div>
        <p className="mt-2 text-[10px] text-th-text-muted">
          This is an HTML approximation. The actual PDF may differ slightly in
          spacing and typography.
        </p>
      </div>
    </div>
  )
}
