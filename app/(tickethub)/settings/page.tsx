import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'

export const dynamic = 'force-dynamic'

const GROUPS = [
  {
    title: 'Operations',
    items: [
      {
        href: '/settings/sla',
        title: 'SLA Policies',
        description: 'Response and resolve targets per priority',
      },
      {
        href: '/settings/items',
        title: 'Item Catalog',
        description: 'Labor rates, parts, and expense items',
      },
      {
        href: '/settings/tax-rates',
        title: 'Tax Rates',
        description: 'Sales tax rate per state',
      },
    ],
  },
  {
    title: 'Templates',
    items: [
      {
        href: '/settings/checklist-templates',
        title: 'Checklist Templates',
        description: 'Reusable SOP checklists for tickets',
      },
      {
        href: '/settings/invoice-template',
        title: 'Invoice Template',
        description: 'Customize invoice PDF layout, colors, and logo',
      },
    ],
  },
  {
    title: 'People',
    items: [
      {
        href: '/settings/users',
        title: 'Users',
        description: 'Roles, hourly rates, activation',
      },
      {
        href: '/settings/notifications',
        title: 'My Notifications',
        description: 'ntfy topic, Pushover key, on-call mode',
      },
      {
        href: '/settings/working-hours',
        title: 'Working Hours',
        description: 'Per-tech schedules for the dispatch board',
      },
      {
        href: '/settings/vault',
        title: 'Password Vault Shortcut',
        description: 'Show or hide the DocHub vault link in the sidebar',
      },
    ],
  },
  {
    title: 'Integrations',
    items: [
      {
        href: '/settings/integrations',
        title: 'Integrations',
        description: 'ConnectWise RMM, M365, Syncro, QuickBooks',
      },
    ],
  },
  {
    title: 'Automations',
    items: [
      {
        href: '/settings/automations',
        title: 'Workflow Automations',
        description: 'Master switches — on-site ticket workflow, notifications',
      },
    ],
  },
  {
    title: 'Customer Communications',
    items: [
      {
        href: '/admin/messages',
        title: 'Messages',
        description: 'Email templates (with sample previews) + full send log',
      },
    ],
  },
  {
    title: 'Migration',
    items: [
      {
        href: '/admin/syncro-migrate',
        title: 'Syncro Migration',
        description: 'Import customers, contacts, sites, and tickets from Syncro',
      },
    ],
  },
] as const

export default async function SettingsPage() {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Settings</h1>
      </header>

      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              {g.title}
            </h2>
            <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-th-elevated"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-100">
                        {i.title}
                      </div>
                      <div className="text-xs text-th-text-secondary">
                        {i.description}
                      </div>
                    </div>
                    <span className="text-th-text-muted">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
