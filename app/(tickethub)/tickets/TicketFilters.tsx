'use client'

import { useEffect, useState } from 'react'
import type { ViewFilters } from '@/app/lib/actions/ticket-views'

const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

const TYPES = [
  'INCIDENT',
  'SERVICE_REQUEST',
  'PROBLEM',
  'CHANGE',
  'MAINTENANCE',
  'INTERNAL',
] as const

export function TicketFilters({
  users,
  clients,
  currentUserId,
  viewFilters,
  onFiltersChange,
}: {
  users: { id: string; name: string }[]
  clients: { id: string; name: string; shortCode: string | null }[]
  currentUserId: string
  viewFilters: ViewFilters
  onFiltersChange: (filters: ViewFilters) => void
}) {
  // Local state for text inputs with debounce
  const [q, setQ] = useState(viewFilters.q ?? '')
  const [tagInput, setTagInput] = useState(viewFilters.tag ?? '')
  const [showMore, setShowMore] = useState(false)

  // Sync local text state when view changes
  useEffect(() => {
    setQ(viewFilters.q ?? '')
    setTagInput(viewFilters.tag ?? '')
  }, [viewFilters.q, viewFilters.tag])

  // Debounced text search
  useEffect(() => {
    const handle = setTimeout(() => {
      if (q !== (viewFilters.q ?? '')) {
        onFiltersChange({ ...viewFilters, q: q || undefined })
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [q])

  function updateFilter<K extends keyof ViewFilters>(key: K, value: ViewFilters[K]) {
    const next = { ...viewFilters }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete next[key]
    } else {
      next[key] = value
    }
    onFiltersChange(next)
  }

  // Derive "active override" values from viewFilters for the dropdowns
  const statusValue = viewFilters.status?.length === 1 ? viewFilters.status[0] : ''
  const priorityValue = viewFilters.priority?.length === 1 ? viewFilters.priority[0] : ''
  const assigneeValue = viewFilters.assigneeId === '__me__' ? currentUserId
    : viewFilters.assigneeId ?? ''

  const hasDateFilter = viewFilters.dateField || viewFilters.dateFrom || viewFilters.dateTo
  const hasMoreFilters = viewFilters.clientId || viewFilters.type?.length || hasDateFilter
  const shouldShowMore = showMore || hasMoreFilters

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Text search */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or description…"
          className="th-input max-w-xs"
        />

        {/* Status */}
        <select
          value={statusValue}
          onChange={(e) => {
            const val = e.target.value
            updateFilter('status', val ? [val] : undefined)
          }}
          className="th-input w-auto"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>

        {/* Priority */}
        <select
          value={priorityValue}
          onChange={(e) => {
            const val = e.target.value
            updateFilter('priority', val ? [val] : undefined)
          }}
          className="th-input w-auto"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {/* Assignee */}
        <select
          value={assigneeValue}
          onChange={(e) => {
            const val = e.target.value
            if (val === currentUserId) {
              updateFilter('assigneeId', '__me__')
            } else {
              updateFilter('assigneeId', val || undefined)
            }
          }}
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

        {/* Tag */}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => {
            setTagInput(e.target.value)
            const trimmed = e.target.value.trim().toLowerCase()
            updateFilter('tag', trimmed || undefined)
          }}
          placeholder="Filter by tag…"
          className="th-input w-auto max-w-[140px]"
        />
        {viewFilters.tag && (
          <button
            onClick={() => { setTagInput(''); updateFilter('tag', undefined) }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear tag
          </button>
        )}

        {/* Toggle more filters */}
        <button
          type="button"
          onClick={() => setShowMore(!shouldShowMore)}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
            hasMoreFilters
              ? 'bg-accent/10 text-accent'
              : 'text-th-text-muted hover:text-th-text-secondary'
          }`}
        >
          <svg
            className={`h-3 w-3 transition-transform ${shouldShowMore ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
          More filters{hasMoreFilters ? ' (active)' : ''}
        </button>

        {/* Clear all */}
        {Object.keys(viewFilters).length > 0 && (
          <button
            type="button"
            onClick={() => { setQ(''); setTagInput(''); onFiltersChange({}) }}
            className="text-[11px] text-th-text-muted hover:text-red-400"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filters row */}
      {shouldShowMore && (
        <div className="flex flex-wrap items-center gap-2 pl-0">
          {/* Client */}
          <select
            value={viewFilters.clientId ?? ''}
            onChange={(e) => updateFilter('clientId', e.target.value || undefined)}
            className="th-input w-auto"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortCode ?? c.name}
              </option>
            ))}
          </select>

          {/* Type */}
          <select
            value={viewFilters.type?.length === 1 ? viewFilters.type[0] : ''}
            onChange={(e) => {
              const val = e.target.value
              updateFilter('type', val ? [val] : undefined)
            }}
            className="th-input w-auto"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* Date range */}
          <select
            value={viewFilters.dateField ?? ''}
            onChange={(e) => {
              const val = e.target.value as ViewFilters['dateField'] | ''
              if (!val) {
                const next = { ...viewFilters }
                delete next.dateField
                delete next.dateFrom
                delete next.dateTo
                onFiltersChange(next)
              } else {
                updateFilter('dateField', val)
              }
            }}
            className="th-input w-auto"
          >
            <option value="">Date filter…</option>
            <option value="createdAt">Created</option>
            <option value="updatedAt">Updated</option>
            <option value="closedAt">Closed</option>
          </select>

          {viewFilters.dateField && (
            <>
              <input
                type="date"
                value={viewFilters.dateFrom ?? ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
                className="th-input w-auto"
              />
              <span className="text-xs text-th-text-muted">to</span>
              <input
                type="date"
                value={viewFilters.dateTo ?? ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
                className="th-input w-auto"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
