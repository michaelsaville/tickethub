import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { SyncroMigratePanel } from './SyncroMigratePanel'

export const dynamic = 'force-dynamic'

export default async function SyncroMigratePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'GLOBAL_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Syncro Migration</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Global Admin role required.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Syncro Migration
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Import customers, contacts, sites, and tickets from Syncro MSP.
          Records are matched by Syncro ID — safe to run multiple times.
        </p>
      </header>

      <SyncroMigratePanel />
    </div>
  )
}
