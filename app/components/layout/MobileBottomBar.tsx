'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Tab {
  href: string
  label: string
  icon: string
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/tickets', label: 'Tickets', icon: '🎫' },
  { href: '', label: '', icon: '' }, // FAB slot
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/inbox', label: 'Inbox', icon: '📥' },
]

interface FabAction {
  href: string
  label: string
  icon: string
}

const FAB_ACTIONS_GLOBAL: FabAction[] = [
  { href: '/tickets/new', label: 'New ticket', icon: '🎫' },
  { href: '/clients/new', label: 'New client', icon: '👥' },
  { href: '/invoices/new', label: 'New invoice', icon: '🧾' },
  { href: '/schedule', label: 'Schedule', icon: '📅' },
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/tickets?q=', label: 'Search tickets', icon: '🔎' },
]

/** When on a ticket detail page, show ticket-scoped actions instead. */
function getTicketFabActions(_ticketId: string): FabAction[] {
  return [
    { href: `#add-note`, label: 'Add Note', icon: '📝' },
    { href: `#log-time`, label: 'Log Time', icon: '⏱️' },
    { href: `#add-part`, label: 'Add Part', icon: '🔧' },
    { href: `#add-photo`, label: 'Photo', icon: '📷' },
    { href: `/notifications`, label: 'Notifications', icon: '🔔' },
  ]
}

const RED_BADGE_ROUTES = new Set(['/invoices', '/estimates', '/inbox'])

export function MobileBottomBar({
  inboxCount = 0,
  ticketCount = 0,
  invoiceCount = 0,
  estimateCount = 0,
}: {
  inboxCount?: number
  ticketCount?: number
  invoiceCount?: number
  estimateCount?: number
}) {
  const mobileBadges: Record<string, number> = {}
  if (inboxCount > 0) mobileBadges['/inbox'] = inboxCount
  if (ticketCount > 0) mobileBadges['/tickets'] = ticketCount
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Detect if we're on a ticket detail page for context-aware FAB
  const ticketMatch = pathname.match(/^\/tickets\/([^/]+)$/)
  const isTicketDetail = ticketMatch && ticketMatch[1] !== 'new'
  const FAB_ACTIONS = isTicketDetail
    ? getTicketFabActions(ticketMatch![1])
    : FAB_ACTIONS_GLOBAL

  // Close the speed-dial on route change so it doesn't linger after nav.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Esc closes the dial; nice on external keyboards plugged into tablets.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close action menu"
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      <nav
        aria-label="Primary mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-t border-th-border bg-th-surface/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((tab, i) => {
          if (i === 2) {
            return (
              <div
                key="fab"
                className="relative flex flex-1 items-start justify-center"
              >
                {open && (
                  <div
                    className="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-stretch gap-2"
                    role="menu"
                  >
                    {FAB_ACTIONS.map((a, idx) => (
                      <Link
                        key={a.href}
                        href={a.href}
                        role="menuitem"
                        className="flex items-center gap-2 rounded-full border border-th-border bg-th-surface px-4 py-2 text-xs text-slate-100 shadow-lg"
                        style={{
                          animation: `fabItem 180ms ease-out ${idx * 35}ms both`,
                        }}
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-base" aria-hidden>
                          {a.icon}
                        </span>
                        <span className="whitespace-nowrap">{a.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={open ? 'Close action menu' : 'Open action menu'}
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                  className={`relative -mt-4 flex h-14 w-14 items-center justify-center self-start rounded-full bg-accent text-2xl text-white shadow-lg shadow-accent/30 ring-4 ring-th-base transition-transform duration-200 ${
                    open ? 'rotate-45' : ''
                  }`}
                >
                  +
                </button>
              </div>
            )
          }
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                active
                  ? 'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-accent'
                  : 'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-th-text-muted hover:text-slate-200'
              }
            >
              <span className="text-lg leading-none" aria-hidden>
                {tab.icon}
              </span>
              {mobileBadges[tab.href] != null && mobileBadges[tab.href] > 0 && (
                <span className={`absolute top-1 left-1/2 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full ${RED_BADGE_ROUTES.has(tab.href) ? 'bg-red-500' : 'bg-amber-500'} px-1 text-[9px] font-bold leading-none text-white`}>
                  {mobileBadges[tab.href] > 99 ? '99+' : mobileBadges[tab.href]}
                </span>
              )}
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      <style jsx global>{`
        @keyframes fabItem {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  )
}
