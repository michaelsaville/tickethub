'use client'

import { useState, useEffect, useTransition } from 'react'
import { linkDochubAsset, unlinkDochubAsset } from '@/app/lib/actions/dochub-asset'

const DOCHUB_URL = process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.pcc2k.com'

interface Asset {
  id: string
  name: string
  category: string
  status: string
  make: string | null
  model: string | null
  serial: string | null
  ipAddress: string | null
  locationName: string | null
  primaryUserName: string | null
}

interface Props {
  ticketId: string
  clientName: string
  linkedAssetId: string | null
  linkedAssetName: string | null
}

export function DochubAssetPicker({ ticketId, clientName, linkedAssetId, linkedAssetName }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const params = new URLSearchParams({ clientName })
    if (search) params.set('q', search)
    fetch(`/api/dochub-assets?${params}`)
      .then((r) => r.json())
      .then((json) => setAssets(json.data ?? []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [open, search, clientName])

  function handleSelect(asset: Asset) {
    startTransition(async () => {
      await linkDochubAsset(ticketId, asset.id, asset.name)
      setOpen(false)
    })
  }

  function handleUnlink() {
    startTransition(async () => {
      await unlinkDochubAsset(ticketId)
    })
  }

  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Asset
      </dt>
      {linkedAssetId ? (
        <dd className="mt-1 flex items-center gap-2">
          <a
            href={`${DOCHUB_URL}/assets/${linkedAssetId}`}
            target="_blank"
            rel="noopener"
            className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            {linkedAssetName ?? 'View Asset'}
          </a>
          <button
            onClick={handleUnlink}
            disabled={isPending}
            className="text-[10px] text-slate-500 hover:text-red-400"
          >
            unlink
          </button>
        </dd>
      ) : (
        <dd className="mt-1">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs text-slate-400 hover:text-amber-300"
          >
            {open ? 'Cancel' : '+ Link DocHub Asset'}
          </button>
        </dd>
      )}

      {open && (
        <div className="mt-2 rounded-lg border border-th-border bg-th-surface p-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="w-full rounded border border-th-border bg-th-elevated px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            autoFocus
          />
          <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
            {loading && <p className="py-2 text-center text-[10px] text-slate-500 animate-pulse">Loading...</p>}
            {!loading && assets.length === 0 && (
              <p className="py-2 text-center text-[10px] text-slate-500">
                No assets found for {clientName}
              </p>
            )}
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => handleSelect(a)}
                disabled={isPending}
                className="w-full rounded px-2 py-1.5 text-left hover:bg-th-elevated transition-colors"
              >
                <div className="text-xs font-medium text-slate-200">{a.name}</div>
                <div className="text-[10px] text-slate-500">
                  {[a.category, a.make, a.model, a.serial, a.ipAddress]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {(a.primaryUserName || a.locationName) && (
                  <div className="text-[10px] text-slate-600">
                    {a.primaryUserName && `User: ${a.primaryUserName}`}
                    {a.primaryUserName && a.locationName && ' · '}
                    {a.locationName && `Site: ${a.locationName}`}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
