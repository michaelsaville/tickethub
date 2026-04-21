'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { TicketViewRow, ViewFilters, ViewSort } from '@/app/lib/actions/ticket-views'
import { ViewSelector } from './ViewSelector'
import { TicketFilters } from './TicketFilters'

/**
 * Client-side wrapper that owns the filter state.
 * Reads filters from the active view, lets user override them,
 * and propagates changes back to the URL for the server component to read.
 */
export function TicketListClient({
  views,
  defaultViewId,
  activeViewId,
  users,
  clients,
  currentUserId,
}: {
  views: TicketViewRow[]
  defaultViewId: string | null
  activeViewId: string | null
  users: { id: string; name: string }[]
  clients: { id: string; name: string; shortCode: string | null }[]
  currentUserId: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  // Active view's base filters
  const activeView = views.find((v) => v.id === activeViewId)

  // Current filters: view filters + any overrides from URL
  const currentFilters: ViewFilters = useMemo(() => {
    const base = activeView?.filters ?? {}
    const overrides: ViewFilters = {}

    // URL overrides take precedence
    const pStatus = params.get('status')
    const pPriority = params.get('priority')
    const pAssignee = params.get('assigneeId')
    const pClient = params.get('clientId')
    const pType = params.get('type')
    const pTag = params.get('tag')
    const pQ = params.get('q')
    const pDateField = params.get('dateField')
    const pDateFrom = params.get('dateFrom')
    const pDateTo = params.get('dateTo')

    if (pStatus) overrides.status = [pStatus]
    if (pPriority) overrides.priority = [pPriority]
    if (pAssignee) overrides.assigneeId = pAssignee
    if (pClient) overrides.clientId = pClient
    if (pType) overrides.type = [pType]
    if (pTag) overrides.tag = pTag
    if (pQ) overrides.q = pQ
    if (pDateField) overrides.dateField = pDateField as ViewFilters['dateField']
    if (pDateFrom) overrides.dateFrom = pDateFrom
    if (pDateTo) overrides.dateTo = pDateTo

    // If no URL overrides, use view filters directly
    const hasOverrides = Object.keys(overrides).length > 0
    return hasOverrides ? { ...base, ...overrides } : { ...base }
  }, [activeView, params])

  const currentSort = activeView?.sort ?? null

  // When filters change, push overrides to URL
  const handleFiltersChange = useCallback(
    (filters: ViewFilters) => {
      const next = new URLSearchParams()
      if (activeViewId) next.set('viewId', activeViewId)

      // Only set params that differ from the view's base filters
      const base = activeView?.filters ?? {}

      if (filters.status && JSON.stringify(filters.status) !== JSON.stringify(base.status)) {
        if (filters.status.length === 1) next.set('status', filters.status[0])
      }
      if (filters.priority && JSON.stringify(filters.priority) !== JSON.stringify(base.priority)) {
        if (filters.priority.length === 1) next.set('priority', filters.priority[0])
      }
      if (filters.assigneeId !== undefined && filters.assigneeId !== base.assigneeId) {
        next.set('assigneeId', filters.assigneeId)
      }
      if (filters.clientId && filters.clientId !== base.clientId) {
        next.set('clientId', filters.clientId)
      }
      if (filters.type && JSON.stringify(filters.type) !== JSON.stringify(base.type)) {
        if (filters.type.length === 1) next.set('type', filters.type[0])
      }
      if (filters.tag && filters.tag !== base.tag) next.set('tag', filters.tag)
      if (filters.q && filters.q !== base.q) next.set('q', filters.q)
      if (filters.dateField && filters.dateField !== base.dateField) {
        next.set('dateField', filters.dateField)
      }
      if (filters.dateFrom && filters.dateFrom !== base.dateFrom) {
        next.set('dateFrom', filters.dateFrom)
      }
      if (filters.dateTo && filters.dateTo !== base.dateTo) {
        next.set('dateTo', filters.dateTo)
      }

      router.replace(`/tickets?${next.toString()}`)
    },
    [activeViewId, activeView, router],
  )

  return (
    <div className="space-y-3">
      <ViewSelector
        views={views}
        defaultViewId={defaultViewId}
        activeViewId={activeViewId}
        currentFilters={currentFilters}
        currentSort={currentSort}
      />
      <TicketFilters
        users={users}
        clients={clients}
        currentUserId={currentUserId}
        viewFilters={currentFilters}
        onFiltersChange={handleFiltersChange}
      />
    </div>
  )
}
