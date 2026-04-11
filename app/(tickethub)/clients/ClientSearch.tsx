'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export function ClientSearch({
  initialQuery,
  includeInactive,
}: {
  initialQuery: string
  includeInactive: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(initialQuery)

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (q) next.set('q', q)
      else next.delete('q')
      router.replace(`/clients?${next.toString()}`)
    }, 200)
    return () => clearTimeout(handle)
  }, [q, params, router])

  function toggleInactive() {
    const next = new URLSearchParams(params.toString())
    if (includeInactive) next.delete('inactive')
    else next.set('inactive', '1')
    router.replace(`/clients?${next.toString()}`)
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients by name or code…"
        className="th-input max-w-md"
        autoFocus
      />
      <label className="flex cursor-pointer items-center gap-2 text-xs text-th-text-secondary">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={toggleInactive}
          className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
        />
        Show inactive
      </label>
    </div>
  )
}
