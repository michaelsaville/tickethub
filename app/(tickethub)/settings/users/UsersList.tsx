'use client'

import { useState, useTransition } from 'react'
import {
  setUserActive,
  setUserOnsiteTech,
  updateHourlyRate,
  updateUserRole,
} from '@/app/lib/actions/users'
import { formatCents, parseCents } from '@/app/lib/billing'

type User = {
  id: string
  email: string
  name: string
  role: string
  hourlyRate: number | null
  isActive: boolean
  isOnsiteTech: boolean
  createdAt: Date
}

const ROLES = [
  'GLOBAL_ADMIN',
  'TICKETHUB_ADMIN',
  'DISPATCHER',
  'TECH',
  'VIEWER',
] as const

export function UsersList({
  users,
  currentUserId,
}: {
  users: User[]
  currentUserId: string
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-th-border">
      <table className="w-full text-sm">
        <thead className="bg-th-elevated text-left font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Email</th>
            <th className="px-4 py-2 w-48">Role</th>
            <th className="px-4 py-2 w-40">Hourly Rate</th>
            <th className="px-4 py-2 w-32">On-site</th>
            <th className="px-4 py-2 w-32">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-th-border bg-th-surface">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isMe={u.id === currentUserId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UserRow({ user, isMe }: { user: User; isMe: boolean }) {
  const [role, setRole] = useState(user.role)
  const [active, setActive] = useState(user.isActive)
  const [onsite, setOnsite] = useState(user.isOnsiteTech)
  const [rate, setRate] = useState<string>(
    user.hourlyRate != null ? formatCents(user.hourlyRate) : '',
  )
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRole(v: string) {
    setErr(null)
    const prev = role
    setRole(v)
    startTransition(async () => {
      const res = await updateUserRole(user.id, v)
      if (!res.ok) {
        setErr(res.error)
        setRole(prev)
      }
    })
  }

  function handleOnsite(v: boolean) {
    setErr(null)
    const prev = onsite
    setOnsite(v)
    startTransition(async () => {
      const res = await setUserOnsiteTech(user.id, v)
      if (!res.ok) {
        setErr(res.error)
        setOnsite(prev)
      }
    })
  }

  function handleActive(v: boolean) {
    setErr(null)
    const prev = active
    setActive(v)
    startTransition(async () => {
      const res = await setUserActive(user.id, v)
      if (!res.ok) {
        setErr(res.error)
        setActive(prev)
      }
    })
  }

  function handleRateBlur() {
    setErr(null)
    const cents = rate.trim() ? parseCents(rate) : null
    startTransition(async () => {
      const res = await updateHourlyRate(user.id, cents)
      if (!res.ok) {
        setErr(res.error)
      } else if (cents != null) {
        setRate(formatCents(cents))
      }
    })
  }

  return (
    <tr className={active ? '' : 'opacity-50'}>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-100">
          {user.name}
          {isMe && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-accent">
              You
            </span>
          )}
        </div>
        {err && <div className="text-xs text-priority-urgent">{err}</div>}
      </td>
      <td className="px-4 py-3 text-th-text-secondary">{user.email}</td>
      <td className="px-4 py-3">
        <select
          value={role}
          onChange={(e) => handleRole(e.target.value)}
          disabled={isPending}
          className="th-input text-xs"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={handleRateBlur}
          placeholder="$0.00"
          className="th-input text-xs font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => handleOnsite(!onsite)}
          disabled={isPending}
          className={
            onsite
              ? 'th-btn-ghost text-xs text-status-resolved'
              : 'th-btn-ghost text-xs text-th-text-muted'
          }
        >
          {onsite ? 'Yes' : 'No'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => handleActive(!active)}
          disabled={isPending || isMe}
          className={
            active
              ? 'th-btn-ghost text-xs text-status-resolved'
              : 'th-btn-ghost text-xs text-th-text-muted'
          }
        >
          {active ? 'Active' : 'Inactive'}
        </button>
      </td>
    </tr>
  )
}
