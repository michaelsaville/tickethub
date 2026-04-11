'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  href: string
  label: string
  icon: string
  fab?: boolean
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/tickets', label: 'Tickets', icon: '🎫' },
  { href: '/tickets/new', label: 'New', icon: '➕', fab: true },
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/settings', label: 'More', icon: '⋯' },
]

export function MobileBottomBar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Primary mobile"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-th-border bg-th-surface/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        if (tab.fab) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative -mt-4 flex h-14 w-14 items-center justify-center self-start rounded-full bg-accent text-xl text-white shadow-lg shadow-accent/30 ring-4 ring-th-base"
              aria-label={tab.label}
            >
              {tab.icon}
            </Link>
          )
        }
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
  )
}
