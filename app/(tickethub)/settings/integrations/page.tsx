import { redirect } from 'next/navigation'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { getAllSettingStatuses } from '@/app/lib/settings'
import IntegrationSettings from './IntegrationSettings'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'GLOBAL_ADMIN')) {
    redirect('/settings')
  }

  const statuses = await getAllSettingStatuses()
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com').replace(/\/$/, '')

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">Integrations</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Manage API keys and integration credentials. Values are stored
          encrypted in the database.
        </p>
        <p className="mt-1 text-xs text-th-text-muted">
          Database-stored keys are used directly by features that support
          DB-backed config. For features still reading environment variables,
          changes take effect after container restart.
        </p>
      </header>

      <IntegrationSettings
        initialStatuses={statuses}
        baseUrl={baseUrl}
      />
    </div>
  )
}
