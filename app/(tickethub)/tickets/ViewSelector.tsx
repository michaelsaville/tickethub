'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import type { TicketViewRow, ViewFilters, ViewSort } from '@/app/lib/actions/ticket-views'
import {
  createTicketView,
  updateTicketView,
  deleteTicketView,
  setDefaultView,
} from '@/app/lib/actions/ticket-views'

const VIEW_ICONS: Record<string, string> = {
  user: '\u{1F464}',     // person
  inbox: '\u{1F4E5}',    // inbox
  list: '\u{1F4CB}',     // clipboard
  alert: '\u{26A0}\uFE0F', // warning
  clock: '\u{1F552}',    // clock
  check: '\u{2705}',     // check
}

export function ViewSelector({
  views,
  defaultViewId,
  activeViewId,
  currentFilters,
  currentSort,
}: {
  views: TicketViewRow[]
  defaultViewId: string | null
  activeViewId: string | null
  currentFilters: ViewFilters
  currentSort: ViewSort | null
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [showSave, setShowSave] = useState(false)
  const [showMenu, setShowMenu] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const systemViews = views.filter((v) => v.visibility === 'SYSTEM')
  const personalViews = views.filter((v) => v.visibility === 'PERSONAL')
  const sharedViews = views.filter((v) => v.visibility === 'SHARED')

  function selectView(viewId: string) {
    const next = new URLSearchParams()
    next.set('viewId', viewId)
    router.replace(`/tickets?${next.toString()}`)
  }

  async function handleSave() {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const view = await createTicketView({
        name: saveName.trim(),
        filters: currentFilters,
        sort: currentSort ?? undefined,
      })
      setShowSave(false)
      setSaveName('')
      selectView(view.id)
    } catch (e: any) {
      alert(e.message || 'Failed to save view')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateFilters(viewId: string) {
    try {
      await updateTicketView(viewId, { filters: currentFilters })
    } catch (e: any) {
      alert(e.message || 'Failed to update view')
    }
  }

  async function handleDelete(viewId: string) {
    if (!confirm('Delete this view?')) return
    try {
      await deleteTicketView(viewId)
      // Switch to first system view
      if (systemViews.length > 0) selectView(systemViews[0].id)
    } catch (e: any) {
      alert(e.message || 'Failed to delete view')
    }
  }

  async function handleSetDefault(viewId: string) {
    try {
      await setDefaultView(viewId)
      setShowMenu(null)
    } catch (e: any) {
      alert(e.message || 'Failed to set default')
    }
  }

  // Check if current filters differ from active view's filters
  const activeView = views.find((v) => v.id === activeViewId)
  const filtersModified =
    activeView && JSON.stringify(currentFilters) !== JSON.stringify(activeView.filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* View pills */}
      <div className="flex flex-wrap items-center gap-1">
        {systemViews.map((v) => (
          <ViewPill
            key={v.id}
            view={v}
            isActive={v.id === activeViewId}
            isDefault={v.id === defaultViewId}
            onSelect={() => selectView(v.id)}
            onMenu={() => setShowMenu(showMenu === v.id ? null : v.id)}
            showMenu={showMenu === v.id}
            menuRef={showMenu === v.id ? menuRef : undefined}
            onSetDefault={() => handleSetDefault(v.id)}
            onDelete={undefined}
            onUpdateFilters={undefined}
          />
        ))}

        {sharedViews.length > 0 && (
          <>
            <span className="mx-1 text-th-border">|</span>
            {sharedViews.map((v) => (
              <ViewPill
                key={v.id}
                view={v}
                isActive={v.id === activeViewId}
                isDefault={v.id === defaultViewId}
                onSelect={() => selectView(v.id)}
                onMenu={() => setShowMenu(showMenu === v.id ? null : v.id)}
                showMenu={showMenu === v.id}
                menuRef={showMenu === v.id ? menuRef : undefined}
                onSetDefault={() => handleSetDefault(v.id)}
                onDelete={() => handleDelete(v.id)}
                onUpdateFilters={
                  filtersModified && v.id === activeViewId
                    ? () => handleUpdateFilters(v.id)
                    : undefined
                }
              />
            ))}
          </>
        )}

        {personalViews.length > 0 && (
          <>
            <span className="mx-1 text-th-border">|</span>
            {personalViews.map((v) => (
              <ViewPill
                key={v.id}
                view={v}
                isActive={v.id === activeViewId}
                isDefault={v.id === defaultViewId}
                onSelect={() => selectView(v.id)}
                onMenu={() => setShowMenu(showMenu === v.id ? null : v.id)}
                showMenu={showMenu === v.id}
                menuRef={showMenu === v.id ? menuRef : undefined}
                onSetDefault={() => handleSetDefault(v.id)}
                onDelete={() => handleDelete(v.id)}
                onUpdateFilters={
                  filtersModified && v.id === activeViewId
                    ? () => handleUpdateFilters(v.id)
                    : undefined
                }
              />
            ))}
          </>
        )}
      </div>

      {/* Save current as new view */}
      {!showSave ? (
        <button
          type="button"
          onClick={() => setShowSave(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-th-text-muted hover:bg-th-elevated hover:text-th-text-secondary transition-colors"
          title="Save current filters as a view"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Save view
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="View name…"
            className="th-input h-7 w-40 text-xs"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
            className="th-btn-primary h-7 px-2 text-xs disabled:opacity-50"
          >
            {saving ? '...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setShowSave(false); setSaveName('') }}
            className="text-xs text-th-text-muted hover:text-th-text-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Indicator that filters have been modified from the view */}
      {filtersModified && (
        <span className="text-[10px] text-amber-400/80 italic">
          (modified)
        </span>
      )}
    </div>
  )
}

// ─── Individual view pill ─────────────────────────────────────────────────

function ViewPill({
  view,
  isActive,
  isDefault,
  onSelect,
  onMenu,
  showMenu,
  menuRef,
  onSetDefault,
  onDelete,
  onUpdateFilters,
}: {
  view: TicketViewRow
  isActive: boolean
  isDefault: boolean
  onSelect: () => void
  onMenu: () => void
  showMenu: boolean
  menuRef?: React.RefObject<HTMLDivElement | null>
  onSetDefault: () => void
  onDelete: (() => void) | undefined
  onUpdateFilters: (() => void) | undefined
}) {
  const icon = view.icon ? VIEW_ICONS[view.icon] ?? '' : ''

  return (
    <div className="relative" ref={showMenu ? menuRef : undefined}>
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu()
        }}
        className={`
          inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors
          ${isActive
            ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
            : 'bg-th-surface-raised text-th-text-secondary hover:bg-th-elevated hover:text-th-text-primary'
          }
        `}
      >
        {icon && <span className="text-[11px]">{icon}</span>}
        {view.name}
        {isDefault && (
          <span className="ml-0.5 text-[9px] text-accent/60" title="Default view">
            *
          </span>
        )}
      </button>

      {showMenu && (
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-th-border bg-th-surface shadow-lg">
          <div className="py-1">
            <button
              type="button"
              onClick={() => { onSetDefault(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated"
            >
              {isDefault ? 'Default view' : 'Set as default'}
              {isDefault && <span className="text-accent">*</span>}
            </button>
            {onUpdateFilters && (
              <button
                type="button"
                onClick={() => { onUpdateFilters(); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated"
              >
                Update filters
              </button>
            )}
            {onDelete && (
              <>
                <hr className="my-1 border-th-border" />
                <button
                  type="button"
                  onClick={() => { onDelete(); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-th-elevated"
                >
                  Delete view
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
