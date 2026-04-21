import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { getAutomationSnapshot } from '@/app/lib/actions/automations'
import { AutomationsList } from './AutomationsList'

export const dynamic = 'force-dynamic'

const FLAG_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  'onsite_workflow.enabled': {
    title: 'On-site ticket workflow',
    description:
      'Restrict the dispatch unscheduled queue to tickets on the On-Site board, show On-Site New / Scheduled labels, and expose the client-confirmation email icon on scheduled appointments.',
  },
}

export default async function AutomationsSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-2xl text-slate-100">Automations</h1>
        <p className="mt-2 text-sm text-priority-urgent">
          Admin role required.
        </p>
      </div>
    )
  }

  const snapshot = await getAutomationSnapshot()

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">Automations</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Master switches for optional workflow behaviours. Flipping any of
          these off disables the corresponding server-side gates everywhere.
        </p>
      </header>

      <AutomationsList snapshot={snapshot} descriptions={FLAG_DESCRIPTIONS} />
    </div>
  )
}
