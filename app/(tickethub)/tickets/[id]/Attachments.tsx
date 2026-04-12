'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueRequest } from '@/app/lib/sync-queue'

const MAX_QUEUE_SIZE = 8 * 1024 * 1024 // 8 MB — IndexedDB base64 safety cap

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('unexpected reader result'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

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
      // Files larger than the queue cap go straight through multipart —
      // base64 in IndexedDB balloons ~33% and blows the quota. Those
      // uploads still fail offline, but at least they don't crash Dexie.
      if (file.size > MAX_QUEUE_SIZE) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
          method: 'POST',
          body: fd,
        })
        const ct = res.headers.get('content-type') ?? ''
        if (!ct.includes('application/json')) {
          setErr(
            res.status === 413
              ? 'File too large for the server (nginx limit?)'
              : `Upload failed: HTTP ${res.status}`,
          )
          return
        }
        const json = await res.json()
        if (!res.ok || json.error) {
          setErr(json.error ?? `Upload failed (${res.status})`)
          return
        }
        setItems((xs) => [...xs, json.data])
        router.refresh()
        return
      }

      const base64 = await fileToBase64(file)
      const result = await enqueueRequest({
        type: 'ATTACH_PHOTO',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/attachments`,
        body: {
          filename: file.name || 'upload.bin',
          mimeType: file.type || 'application/octet-stream',
          base64,
        },
      })
      if (result.synced) {
        const data = (result.response as { data?: Attachment })?.data
        if (data) setItems((xs) => [...xs, data])
        router.refresh()
      } else {
        setErr('Offline — upload queued, will sync when online.')
      }
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
        <div className="flex items-center gap-2">
          <label className="th-btn-secondary cursor-pointer text-xs">
            {uploading ? 'Uploading…' : '📷 Photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <label className="th-btn-secondary cursor-pointer text-xs">
            + Upload
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
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
