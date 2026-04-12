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

const FAB_ACTIONS: FabAction[] = [
  { href: '/tickets/new', label: 'New ticket', icon: '🎫' },
  { href: '/clients/new', label: 'New client', icon: '👥' },
  { href: '/invoices/new', label: 'New invoice', icon: '🧾' },
  { href: '/tickets?q=', label: 'Search tickets', icon: '🔎' },
]

export function MobileBottomBar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

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
                  ? 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-accent'
                  : 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-th-text-muted hover:text-slate-200'
              }
            >
              <span className="text-lg leading-none" aria-hidden>
                {tab.icon}
              </span>
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
