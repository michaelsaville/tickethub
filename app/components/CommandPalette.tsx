'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  paletteSearch,
  paletteRecentTickets,
  type PaletteResult,
  type RecentTicketDTO,
} from '@/app/lib/actions/command-palette'

type Item = {
  key: string
  label: string
  hint?: string
  icon: string
  href?: string
  onSelect?: () => void
  group: string
}

const NAV_ITEMS: Omit<Item, 'group'>[] = [
  { key: 'nav-dashboard', label: 'Dashboard', icon: '🏠', href: '/dashboard' },
  { key: 'nav-inbox', label: 'Inbox', icon: '📥', href: '/inbox' },
  { key: 'nav-tickets', label: 'Tickets', icon: '🎫', href: '/tickets' },
  { key: 'nav-clients', label: 'Clients', icon: '👥', href: '/clients' },
  { key: 'nav-estimates', label: 'Estimates', icon: '📋', href: '/estimates' },
  { key: 'nav-invoices', label: 'Invoices', icon: '🧾', href: '/invoices' },
  { key: 'nav-assets', label: 'Assets', icon: '💻', href: '/assets' },
  { key: 'nav-reports', label: 'Reports', icon: '📊', href: '/reports' },
  { key: 'nav-schedule', label: 'Schedule', icon: '📅', href: '/schedule' },
  { key: 'nav-kb', label: 'Knowledge Base', icon: '📚', href: '/kb' },
  { key: 'nav-reminders', label: 'Reminders', icon: '⏰', href: '/reminders' },
  { key: 'nav-pos', label: 'Purchase Orders', icon: '📦', href: '/purchase-orders' },
  { key: 'nav-vendors', label: 'Vendors', icon: '🏷️', href: '/vendors' },
  { key: 'nav-settings', label: 'Settings', icon: '⚙️', href: '/settings' },
]

const ACTION_ITEMS: Omit<Item, 'group'>[] = [
  { key: 'act-new-ticket', label: 'New ticket', hint: 'Create a new ticket', icon: '➕', href: '/tickets/new' },
  { key: 'act-new-client', label: 'New client', hint: 'Create a new client', icon: '➕', href: '/clients/new' },
  { key: 'act-mine', label: 'My queue', hint: 'Tickets assigned to me', icon: '👤', href: '/tickets?view=mine' },
  { key: 'act-unassigned', label: 'Unassigned', hint: 'Tickets without an owner', icon: '🆓', href: '/tickets?view=unassigned' },
  { key: 'act-sla-risk', label: 'SLA at risk', hint: 'Tickets nearing breach', icon: '⚠️', href: '/tickets?view=sla-risk' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{
    tickets: PaletteResult[]
    clients: PaletteResult[]
    contacts: PaletteResult[]
    kb: PaletteResult[]
  }>({ tickets: [], clients: [], contacts: [], kb: [] })
  const [recents, setRecents] = useState<RecentTicketDTO[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const reqIdRef = useRef(0)

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
      // "/" focuses palette unless typing in an input
      if (e.key === '/' && !open) {
        const tag = target?.tagName
        const editable = target?.isContentEditable
        if (
          tag !== 'INPUT' &&
          tag !== 'TEXTAREA' &&
          tag !== 'SELECT' &&
          !editable
        ) {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input + reset state when opening; load recents on first open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      // defer focus to next tick so the modal has mounted
      setTimeout(() => inputRef.current?.focus(), 0)
      paletteRecentTickets().then(setRecents).catch(() => {})
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setResults({ tickets: [], clients: [], contacts: [], kb: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    const myReq = ++reqIdRef.current
    const t = setTimeout(() => {
      paletteSearch(q)
        .then((r) => {
          if (myReq !== reqIdRef.current) return
          setResults(r)
        })
        .catch(() => {})
        .finally(() => {
          if (myReq === reqIdRef.current) setLoading(false)
        })
    }, 150)
    return () => clearTimeout(t)
  }, [query, open])

  // Build flat ordered item list for current state
  const items: Item[] = (() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) {
      const recentItems: Item[] = recents.map((t) => ({
        key: `recent-${t.id}`,
        group: 'Recent',
        icon: '🎫',
        label: `TH-${t.ticketNumber} · ${t.title}`,
        hint: t.clientName ?? undefined,
        href: `/tickets/${t.id}`,
      }))
      const actionItems: Item[] = ACTION_ITEMS.map((i) => ({ ...i, group: 'Actions' }))
      const navItems: Item[] = NAV_ITEMS.map((i) => ({ ...i, group: 'Navigate' }))
      return [...recentItems, ...actionItems, ...navItems]
    }
    const navMatches: Item[] = [...NAV_ITEMS, ...ACTION_ITEMS]
      .filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          (i.hint?.toLowerCase().includes(q) ?? false)
      )
      .map((i) => ({ ...i, group: 'Navigate' }))
    const ticketItems: Item[] = results.tickets.map((t) =>
      t.kind === 'ticket'
        ? {
            key: `t-${t.id}`,
            group: 'Tickets',
            icon: '🎫',
            label: `TH-${t.ticketNumber} · ${t.title}`,
            hint: [t.clientName, t.status].filter(Boolean).join(' · '),
            href: t.href,
          }
        : ({} as Item)
    )
    const clientItems: Item[] = results.clients.map((c) =>
      c.kind === 'client'
        ? {
            key: `c-${c.id}`,
            group: 'Clients',
            icon: '🏢',
            label: c.name,
            hint: c.shortCode ?? undefined,
            href: c.href,
          }
        : ({} as Item)
    )
    const contactItems: Item[] = results.contacts.map((c) =>
      c.kind === 'contact'
        ? {
            key: `co-${c.id}`,
            group: 'Contacts',
            icon: '👤',
            label: c.name,
            hint: [c.clientName, c.email].filter(Boolean).join(' · '),
            href: c.href,
          }
        : ({} as Item)
    )
    const kbItems: Item[] = results.kb.map((k) =>
      k.kind === 'kb'
        ? {
            key: `k-${k.id}`,
            group: 'Knowledge Base',
            icon: '📚',
            label: k.title,
            href: k.href,
          }
        : ({} as Item)
    )
    return [...ticketItems, ...clientItems, ...contactItems, ...kbItems, ...navMatches]
  })()

  // Clamp active index when items change
  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(0)
  }, [items.length, activeIdx])

  const select = useCallback(
    (item: Item) => {
      if (!item) return
      setOpen(false)
      if (item.href) router.push(item.href)
      else item.onSelect?.()
    },
    [router]
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) select(item)
    }
  }

  // Keep active row visible
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  // Group items for rendering, preserving order
  const grouped: { group: string; items: { item: Item; idx: number }[] }[] = []
  items.forEach((item, idx) => {
    const last = grouped[grouped.length - 1]
    if (last && last.group === item.group) last.items.push({ item, idx })
    else grouped.push({ group: item.group, items: [{ item, idx }] })
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-th-border bg-th-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-th-border px-3 py-2">
          <span className="text-th-text-muted">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search tickets, clients, contacts, KB…"
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <span className="text-xs text-th-text-muted">…</span>}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-th-text-muted">
              {query.trim().length < 2
                ? 'Start typing to search'
                : loading
                ? 'Searching…'
                : 'No matches'}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.group} className="py-1">
                <div className="px-3 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
                  {g.group}
                </div>
                <ul>
                  {g.items.map(({ item, idx }) => (
                    <li key={item.key}>
                      <button
                        data-idx={idx}
                        onClick={() => select(item)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                          idx === activeIdx
                            ? 'bg-th-elevated text-slate-100'
                            : 'text-slate-300 hover:bg-th-elevated/50'
                        }`}
                      >
                        <span className="shrink-0 text-base">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="shrink-0 truncate text-xs text-th-text-muted">
                            {item.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-th-border bg-th-base px-3 py-1.5 text-[10px] text-th-text-muted">
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  )
}
