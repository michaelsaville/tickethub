import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { ItemsList } from './ItemsList'

export const dynamic = 'force-dynamic'

export default async function ItemsSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Item Catalog</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required to manage the item catalog.
        </p>
      </div>
    )
  }

  const items = await prisma.tH_Item.findMany({
    orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { name: 'asc' }],
  })

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Item Catalog</h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Labor rates, parts, and expense items. Prices are in cents but entered
          as dollars (e.g. $75.00 → stored as 7500). LABOR items are priced per
          hour — charges multiply by the logged duration.
        </p>
      </header>

      <ItemsList items={items} />
    </div>
  )
}
