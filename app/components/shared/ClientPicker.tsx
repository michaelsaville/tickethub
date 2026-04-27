'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type PickerClient = {
  id: string
  name: string
  shortCode: string | null
  billingState?: string | null
  isActive?: boolean
}

type CommonProps = {
  clients: PickerClient[]
  /** Visible label above the input. Default: "Client *". */
  label?: string
  /** Placeholder for the search input. */
  placeholder?: string
  /** Whether to render the "Show inactive" checkbox. Caller decides
   *  permission; if false the toggle is hidden and only active clients
   *  passed via `clients` will ever appear. */
  showInactiveToggle?: boolean
  /** Auto-focus the search input on mount. */
  autoFocus?: boolean
  /** Currently-selected client id (for select mode). Used to render the
   *  "selected" pill. */
  selectedId?: string | null
}

type SelectModeProps = CommonProps & {
  mode: 'select'
  /** Called when a client is picked. */
  onPick: (client: PickerClient) => void
}

type NavigateModeProps = CommonProps & {
  mode: 'navigate'
  /** URL template; `{id}` is replaced with the picked client's id. */
  hrefTemplate: string
}

type Props = SelectModeProps | NavigateModeProps

/**
 * Unified client picker shared by /tickets/new, /invoices/new, /estimates/new.
 * - Searchable on name + shortCode
 * - Keyboard nav: ↑ / ↓ to move, Enter to pick
 * - Optional "Show inactive" toggle (active-only by default)
 *
 * Two modes:
 *   - `select`   : returns the picked client to the parent via onPick
 *   - `navigate` : router.push(hrefTemplate.replace('{id}', client.id))
 */
export function ClientPicker(props: Props) {
  const {
    clients,
    label = 'Client *',
    placeholder = 'Search clients by name or code…',
    showInactiveToggle = false,
    autoFocus = true,
    selectedId = null,
  } = props

  const router = useRouter()
  const [query, setQuery] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => includeInactive || c.isActive !== false)
      .filter((c) => {
        if (!q) return true
        return (
          c.name.toLowerCase().includes(q) ||
          (c.shortCode ?? '').toLowerCase().includes(q)
        )
      })
      .slice(0, 200)
  }, [clients, query, includeInactive])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, includeInactive])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${activeIndex}"]`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(client: PickerClient) {
    if (props.mode === 'select') {
      props.onPick(client)
    } else {
      router.push(props.hrefTemplate.replace('{id}', client.id))
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = filtered[activeIndex]
      if (c) pick(c)
    }
  }

  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="th-input flex-1"
          autoFocus={autoFocus}
          aria-label={label}
        />
        {showInactiveToggle && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-th-text-secondary">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
            />
            Show inactive
          </label>
        )}
      </div>

      <ul
        ref={listRef}
        className="mt-2 max-h-72 divide-y divide-th-border overflow-y-auto rounded-md border border-th-border bg-th-surface"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-th-text-muted">
            {query
              ? 'No clients match your search.'
              : 'No clients to show.'}
          </li>
        ) : (
          filtered.map((c, idx) => {
            const isActiveRow = idx === activeIndex
            const isSelected = selectedId === c.id
            return (
              <li key={c.id} data-idx={idx}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    isActiveRow ? 'bg-th-elevated' : 'hover:bg-th-elevated'
                  }`}
                >
                  <span className="flex-1 truncate text-sm text-slate-100">
                    {c.name}
                    {isSelected && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-accent">
                        selected
                      </span>
                    )}
                    {c.isActive === false && (
                      <span className="ml-2 text-[10px] text-th-text-muted">
                        (inactive)
                      </span>
                    )}
                  </span>
                  {c.shortCode && (
                    <span className="font-mono text-[10px] text-th-text-muted">
                      {c.shortCode}
                    </span>
                  )}
                  {c.billingState !== undefined && (
                    <span className="font-mono text-[10px] text-th-text-muted">
                      {c.billingState ?? 'no tax state'}
                    </span>
                  )}
                </button>
              </li>
            )
          })
        )}
      </ul>
      {filtered.length > 0 && (
        <p className="mt-1 text-[10px] text-th-text-muted">
          ↑/↓ to navigate, Enter to select · {filtered.length}{' '}
          {filtered.length === 1 ? 'match' : 'matches'}
        </p>
      )}
    </div>
  )
}
