'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TH_Item } from '@prisma/client'
import { enqueueRequest } from '@/app/lib/sync-queue'

type Item = Pick<TH_Item, 'id' | 'name' | 'type' | 'code'>

type ScanResult = {
  vendor: string | null
  date: string | null
  currency: string | null
  subtotalCents: number | null
  taxCents: number | null
  totalCents: number | null
  lineItems: Array<{
    description: string
    quantity: number | null
    unitPriceCents: number | null
    totalCents: number | null
  }>
  notes: string | null
}

function centsToStr(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

function strToCents(s: string): number | null {
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function ReceiptScanner({
  ticketId,
  items,
}: {
  ticketId: string
  items: Item[]
}) {
  const expenseItems = items.filter(
    (i) => i.type === 'EXPENSE' || i.type === 'LICENSE',
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [itemId, setItemId] = useState<string>(expenseItems[0]?.id ?? '')
  const [vendor, setVendor] = useState('')
  const [date, setDate] = useState('')
  const [total, setTotal] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const router = useRouter()

  function reset() {
    setScan(null)
    setVendor('')
    setDate('')
    setTotal('')
    setNotes('')
    setErr(null)
    setQueuedMsg(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function handleFile(file: File) {
    setErr(null)
    setQueuedMsg(null)
    setScanning(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch(`/api/tickets/${ticketId}/scan-receipt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name || 'receipt.jpg',
          mimeType: file.type || 'image/jpeg',
          base64,
        }),
      })
      const json = (await res.json()) as {
        data: { scan: ScanResult | null } | null
        error: string | null
      }
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? `Scan failed (${res.status})`)
      }
      const parsed = json.data.scan
      if (!parsed) {
        setErr(
          json.error ?? 'Scan returned no data — fill the fields in manually.',
        )
        setScan({
          vendor: null,
          date: null,
          currency: null,
          subtotalCents: null,
          taxCents: null,
          totalCents: null,
          lineItems: [],
          notes: null,
        })
        return
      }
      setScan(parsed)
      setVendor(parsed.vendor ?? '')
      setDate(parsed.date ?? '')
      setTotal(centsToStr(parsed.totalCents))
      setNotes(parsed.notes ?? '')
      router.refresh() // attachment was saved server-side
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  function save() {
    setErr(null)
    setQueuedMsg(null)
    if (!itemId) {
      setErr('Pick an expense item')
      return
    }
    const totalCents = strToCents(total)
    if (totalCents == null || totalCents === 0) {
      setErr('Enter the receipt total')
      return
    }
    const description = [vendor && `${vendor}`, notes && `— ${notes}`]
      .filter(Boolean)
      .join(' ')
      .trim()
    const workDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? new Date(`${date}T12:00:00`).toISOString()
        : undefined

    startSave(async () => {
      try {
        const res = await enqueueRequest({
          type: 'ADD_CHARGE',
          entityType: 'TICKET',
          entityId: ticketId,
          url: `/api/tickets/${ticketId}/charges`,
          body: {
            itemId,
            quantity: 1,
            description: description || null,
            unitPriceOverride: totalCents,
            workDate,
          },
        })
        if (res.synced) {
          router.refresh()
          close()
        } else {
          setQueuedMsg('Offline — charge queued, will sync when online.')
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to save charge')
      }
    })
  }

  if (expenseItems.length === 0) {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="th-btn-secondary w-full text-sm"
      >
        📷 Scan receipt
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div className="th-card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Scan Receipt
              </div>
              <button
                type="button"
                onClick={close}
                className="text-xs text-th-text-muted hover:text-slate-200"
              >
                ✕ close
              </button>
            </div>

            {!scan && (
              <div className="space-y-3">
                <p className="text-xs text-th-text-secondary">
                  Snap or upload a photo of the receipt. Claude will extract
                  vendor, date, and total — you review before the charge is
                  saved.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleFile(f)
                  }}
                  disabled={scanning}
                  className="block w-full text-xs text-th-text-secondary file:mr-3 file:rounded-md file:border file:border-th-border file:bg-th-base file:px-3 file:py-1.5 file:text-xs file:text-slate-200 hover:file:border-accent/40"
                />
                {scanning && (
                  <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
                    Scanning with Claude…
                  </div>
                )}
              </div>
            )}

            {scan && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                      Vendor
                    </span>
                    <input
                      type="text"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="th-input mt-1 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                      Date
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="th-input mt-1 text-sm"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Total ({scan.currency ?? 'USD'})
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="th-input mt-1 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Expense item
                  </span>
                  <select
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className="th-input mt-1 text-sm"
                  >
                    <option value="" disabled>
                      Pick an expense item…
                    </option>
                    {expenseItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        [{i.type}] {i.name}
                        {i.code ? ` (${i.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                    Notes
                  </span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Payment method, last 4, tip, etc."
                    className="th-input mt-1 text-sm"
                  />
                </label>

                {scan.lineItems.length > 0 && (
                  <details className="rounded-md border border-th-border bg-th-base/50 p-2 text-xs">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                      Extracted line items ({scan.lineItems.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-th-text-secondary">
                      {scan.lineItems.map((li, idx) => (
                        <li key={idx} className="flex justify-between gap-2">
                          <span className="truncate">
                            {li.quantity ? `${li.quantity}× ` : ''}
                            {li.description}
                          </span>
                          <span className="font-mono text-th-text-muted">
                            {centsToStr(li.totalCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {err && (
              <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
                {err}
              </div>
            )}
            {queuedMsg && (
              <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                {queuedMsg}
              </div>
            )}

            {scan && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs text-th-text-muted hover:text-slate-200"
                >
                  ← rescan
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={isSaving}
                  className="th-btn-primary"
                >
                  {isSaving ? 'Saving…' : 'Create charge'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
