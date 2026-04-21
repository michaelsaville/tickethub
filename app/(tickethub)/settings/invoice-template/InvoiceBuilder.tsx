'use client'

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
  InvoiceTemplateConfig,
  InvoiceSectionConfig,
} from '@/app/types/invoice-template'
import { saveInvoiceTemplateConfig } from '@/app/lib/actions/invoice-template'
import { SectionCard } from './SectionCard'
import { InvoicePreview } from './InvoicePreview'

const FONT_OPTIONS = [
  { value: 'Helvetica', label: 'Helvetica (Sans-serif)' },
  { value: 'Times-Roman', label: 'Times Roman (Serif)' },
  { value: 'Courier', label: 'Courier (Monospace)' },
] as const

const PAGE_OPTIONS = [
  { value: 'LETTER', label: 'US Letter (8.5" x 11")' },
  { value: 'A4', label: 'A4 (210mm x 297mm)' },
] as const

export function InvoiceBuilder({
  initialConfig,
  initialLogoUrl,
}: {
  initialConfig: InvoiceTemplateConfig
  initialLogoUrl: string | null
}) {
  const [config, setConfig] = useState<InvoiceTemplateConfig>(initialConfig)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

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
    (updated: InvoiceSectionConfig) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === updated.id ? updated : s,
        ),
      }))
    },
    [],
  )

  function updateGlobalStyle<K extends keyof InvoiceTemplateConfig['globalStyles']>(
    key: K,
    value: InvoiceTemplateConfig['globalStyles'][K],
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
      const res = await saveInvoiceTemplateConfig(config, logoUrl)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 200_000) {
      setErr('Logo must be under 200KB')
      return
    }

    setUploading(true)
    setErr(null)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await fetch('/api/invoice-template/logo', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const msg = await res.text()
        setErr(msg || 'Upload failed')
        return
      }
      const { url } = await res.json()
      setLogoUrl(url)
    } catch {
      setErr('Logo upload failed')
    } finally {
      setUploading(false)
    }
  }

  function removeLogo() {
    setLogoUrl(null)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
      {/* Left: Controls */}
      <div className="space-y-4">
        {/* Sections */}
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

        {/* Global Styles */}
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
                placeholder="#F97316"
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
                  e.target.value as InvoiceTemplateConfig['globalStyles']['fontFamily'],
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
                  e.target.value as InvoiceTemplateConfig['globalStyles']['pageSize'],
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

        {/* Logo Upload */}
        <div className="th-card space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Logo
          </h2>
          {logoUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Logo preview"
                className="h-10 max-w-[120px] object-contain"
              />
              <button
                type="button"
                onClick={removeLogo}
                className="th-btn-ghost text-xs text-priority-urgent"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs text-th-text-secondary">
                Upload a logo (PNG/JPG, max 200KB)
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="mt-1 block w-full text-xs text-th-text-secondary file:mr-2 file:rounded file:border-0 file:bg-th-elevated file:px-3 file:py-1 file:text-xs file:text-slate-100 hover:file:bg-accent/20"
              />
            </label>
          )}
        </div>

        {/* Save */}
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

      {/* Right: Preview */}
      <div>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Preview
        </h2>
        <div className="rounded-lg border border-th-border bg-gray-100 p-4">
          <InvoicePreview config={config} logoUrl={logoUrl} />
        </div>
        <p className="mt-2 text-[10px] text-th-text-muted">
          This is an HTML approximation. The actual PDF may differ slightly in
          spacing and typography.
        </p>
      </div>
    </div>
  )
}
