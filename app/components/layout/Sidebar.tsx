'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PRIMARY_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/inbox', label: 'Inbox', icon: '📥' },
  { href: '/tickets', label: 'Tickets', icon: '🎫' },
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/estimates', label: 'Estimates', icon: '📋' },
  { href: '/invoices', label: 'Invoices', icon: '🧾' },
  { href: '/assets', label: 'Assets', icon: '💻' },
  { href: '/reports', label: 'Reports', icon: '📊' },
] as const

const SAVED_VIEWS = [
  { href: '/tickets?view=mine', label: 'My Queue' },
  { href: '/tickets?view=unassigned', label: 'Unassigned' },
  { href: '/tickets?view=sla-risk', label: 'SLA At Risk' },
  { href: '/tickets?view=recent', label: 'Recently Updated' },
] as const

const SECONDARY_NAV = [
  { href: '/reminders', label: 'Reminders', icon: '🔔' },
  { href: '/kb', label: 'Knowledge Base', icon: '📚' },
  { href: '/schedule', label: 'Schedule', icon: '📅' },
  { href: '/fuel-receipts', label: 'Fuel Receipts', icon: '⛽' },
] as const

const DOCHUB_VAULT_URL =
  (process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.pcc2k.com') +
  '/settings?section=my-vault'

const FOOTER_NAV = [
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/profile', label: 'Profile', icon: '👤' },
] as const

const DOCHUB_URL =
  process.env.NEXT_PUBLIC_DOCHUB_URL || 'https://dochub.yourdomain.com'

export function Sidebar({ showVaultLink = false }: { showVaultLink?: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-th-border bg-th-surface">
      <ModuleSwitcher />

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <NavGroup items={PRIMARY_NAV} pathname={pathname} />

        <div className="mt-6 px-3 text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
          My Views
        </div>
        <ul className="mt-1 space-y-0.5">
          {SAVED_VIEWS.map((v) => (
            <li key={v.href}>
              <Link
                href={v.href}
                className="block rounded-md px-3 py-1.5 text-sm text-slate-400 hover:bg-th-elevated hover:text-slate-200"
              >
                {v.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-th-border pt-4">
          <NavGroup items={SECONDARY_NAV} pathname={pathname} />
          {showVaultLink && (
            <ul className="mt-0.5 space-y-0.5">
              <li>
                <a
                  href={DOCHUB_VAULT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-th-elevated hover:text-slate-100"
                  title="Opens DocHub personal password vault in a new tab"
                >
                  <span aria-hidden className="text-base leading-none">🔐</span>
                  <span>Password Vault</span>
                  <span aria-hidden className="ml-auto text-xs text-th-text-muted">↗</span>
                </a>
              </li>
            </ul>
          )}
        </div>
      </nav>

      <div className="border-t border-th-border px-2 py-3">
        <NavGroup items={FOOTER_NAV} pathname={pathname} />
      </div>
    </aside>
  )
}

function ModuleSwitcher() {
  return (
    <div className="flex items-center gap-1 border-b border-th-border p-3">
      <a
        href={DOCHUB_URL}
        className="flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium text-slate-400 transition-colors hover:bg-th-elevated hover:text-slate-200"
      >
        DocHub
      </a>
      <div className="flex-1 rounded-md bg-accent/10 px-3 py-1.5 text-center text-xs font-semibold text-accent ring-1 ring-accent/30">
        TicketHub
      </div>
    </div>
  )
}

function NavGroup({
  items,
  pathname,
}: {
  items: ReadonlyArray<{ href: string; label: string; icon: string }>
  pathname: string
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={
                active
                  ? 'flex items-center gap-3 rounded-md bg-th-elevated px-3 py-2 text-sm font-medium text-accent'
                  : 'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-th-elevated hover:text-slate-100'
              }
            >
              <span aria-hidden className="text-base leading-none">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
