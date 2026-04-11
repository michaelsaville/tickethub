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
