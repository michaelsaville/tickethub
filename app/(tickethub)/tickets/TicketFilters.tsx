'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
] as const
const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

export function TicketFilters({
  users,
  currentUserId,
}: {
  users: { id: string; name: string }[]
  currentUserId: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  const current = {
    status: params.get('status') ?? '',
    priority: params.get('priority') ?? '',
    assigneeId: params.get('assigneeId') ?? '',
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (q) next.set('q', q)
      else next.delete('q')
      router.replace(`/tickets?${next.toString()}`)
    }, 250)
    return () => clearTimeout(handle)
  }, [q, params, router])

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`/tickets?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title or description…"
        className="th-input max-w-xs"
      />

      <select
        value={current.status}
        onChange={(e) => update('status', e.target.value)}
        className="th-input w-auto"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, ' ')}
          </option>
        ))}
      </select>

      <select
        value={current.priority}
        onChange={(e) => update('priority', e.target.value)}
        className="th-input w-auto"
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={current.assigneeId}
        onChange={(e) => update('assigneeId', e.target.value)}
        className="th-input w-auto"
      >
        <option value="">All assignees</option>
        <option value={currentUserId}>Me</option>
        <option value="none">Unassigned</option>
        {users
          .filter((u) => u.id !== currentUserId)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </select>
    </div>
  )
}
