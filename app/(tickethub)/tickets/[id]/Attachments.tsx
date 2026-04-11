'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

type Attachment = {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: Date | string
}

export function Attachments({
  ticketId,
  initial,
}: {
  ticketId: string
  initial: Attachment[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<Attachment[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(json.error ?? `Upload failed (${res.status})`)
        return
      }
      setItems((xs) => [...xs, json.data])
      router.refresh()
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleDelete(id: string, filename: string) {
    if (!confirm(`Delete "${filename}"?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(json.error ?? 'Delete failed')
        return
      }
      setItems((xs) => xs.filter((x) => x.id !== id))
      router.refresh()
    })
  }

  return (
    <div className="th-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Attachments ({items.length})
        </div>
        <label className="th-btn-secondary cursor-pointer text-xs">
          {uploading ? 'Uploading…' : '+ Upload'}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {err && (
        <div className="mb-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
          {err}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-th-text-muted">
          No attachments. Drag a file or click Upload.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-th-border bg-th-base px-3 py-2 text-xs"
            >
              <a
                href={`/api/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-slate-200 hover:text-accent"
              >
                {isImage(a.mimeType) ? '🖼' : '📎'} {a.filename}
              </a>
              <span className="font-mono text-th-text-muted">
                {formatBytes(a.sizeBytes)}
              </span>
              <a
                href={`/api/attachments/${a.id}?download=1`}
                className="th-btn-ghost text-th-text-secondary"
              >
                ↓
              </a>
              <button
                type="button"
                onClick={() => handleDelete(a.id, a.filename)}
                disabled={isPending}
                className="th-btn-ghost text-th-text-muted hover:text-priority-urgent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function isImage(mime: string): boolean {
  return mime.startsWith('image/')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
