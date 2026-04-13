import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { getConfig } from '@/app/lib/settings'
import { NotificationPrefsForm } from './NotificationPrefsForm'
import { InboundForwardersForm } from './InboundForwardersForm'
import { IntegrationTokensForm } from './IntegrationTokensForm'

export const dynamic = 'force-dynamic'

export default async function NotificationSettingsPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const user = await prisma.tH_User.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      ntfyTopic: true,
      pushoverToken: true,
      notificationMode: true,
      inboundForwardEmails: true,
      togglToken: true,
      todoistToken: true,
    },
  })
  if (!user) redirect('/api/auth/signin')

  const ntfyUrl = process.env.NTFY_URL ?? ''
  const pushoverConfigured = Boolean(await getConfig('PUSHOVER_APP_TOKEN'))
  const defaultTopic = process.env.NTFY_SHARED_TOPIC ?? 'tickethub'

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
          My Notifications
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Personal notification preferences. Topic and tokens are per-user.
          Critical alerts always go through on Pushover regardless of mode.
        </p>
      </header>

      <NotificationPrefsForm
        initial={{
          mode: user.notificationMode,
          ntfyTopic: user.ntfyTopic,
          pushoverToken: user.pushoverToken,
        }}
        defaultTopic={defaultTopic}
        ntfyBaseUrl={ntfyUrl}
        pushoverConfigured={pushoverConfigured}
      />

      <div className="mt-8">
        <InboundForwardersForm initial={user.inboundForwardEmails ?? []} />
      </div>

      <div className="mt-8">
        <IntegrationTokensForm
          initialToggl={user.togglToken ?? ''}
          initialTodoist={user.todoistToken ?? ''}
        />
      </div>
    </div>
  )
}
