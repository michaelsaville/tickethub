import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { listCustomFieldDefs } from '@/app/lib/actions/custom-fields'
import { CustomFieldsList } from './CustomFieldsList'

export const dynamic = 'force-dynamic'

export default async function CustomFieldsSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/settings')
  }

  const defs = await listCustomFieldDefs({ includeArchived: true })

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
          Custom Fields
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Define extra fields that appear on every ticket or client. Use them
          for industry-specific data: warranty expiration, license keys, asset
          tags, RMM IDs, anything you&apos;d otherwise stash in notes. Archived
          fields disappear from the editor but historical values are preserved.
        </p>
      </header>

      <CustomFieldsList defs={defs} />
    </div>
  )
}
