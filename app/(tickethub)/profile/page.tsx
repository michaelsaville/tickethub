import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { formatCents } from '@/app/lib/billing'

export const dynamic = 'force-dynamic'

const ROLE_LABELS: Record<string, string> = {
  DEACTIVATED: 'Deactivated',
  VIEWER: 'Viewer',
  TECH: 'Technician',
  DISPATCHER: 'Dispatcher',
  TICKETHUB_ADMIN: 'TicketHub Admin',
  GLOBAL_ADMIN: 'Global Admin',
}

export default async function ProfilePage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const user = await prisma.tH_User.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      hourlyRate: true,
      isActive: true,
      isOnsiteTech: true,
      notificationMode: true,
      createdAt: true,
    },
  })
  if (!user) redirect('/api/auth/signin')

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="font-mono text-2xl text-slate-100">My Profile</h1>
        <p className="mt-1 text-sm text-th-text-secondary">
          Your account details. Personal preferences and integration tokens
          live on the{' '}
          <Link
            href="/settings/notifications"
            className="text-accent hover:underline"
          >
            Notifications
          </Link>{' '}
          page.
        </p>
      </header>

      <section className="overflow-hidden rounded-md border border-th-border">
        <dl className="divide-y divide-th-border">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={ROLE_LABELS[user.role] ?? user.role} />
          <Row
            label="Status"
            value={
              <span
                className={
                  user.isActive
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }
              >
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            }
          />
          <Row
            label="Hourly Rate"
            value={
              user.hourlyRate != null
                ? `${formatCents(user.hourlyRate)} / hr`
                : '—'
            }
          />
          <Row
            label="On-Site Tech"
            value={user.isOnsiteTech ? 'Yes (appears on dispatch board)' : 'No'}
          />
          <Row label="Notification Mode" value={user.notificationMode} />
          <Row
            label="Member Since"
            value={new Date(user.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
        </dl>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <LinkCard
          href="/settings/notifications"
          title="Notifications"
          description="ntfy topic, Pushover, on-call mode, inbound forwarders"
        />
        <LinkCard
          href="/settings/working-hours"
          title="Working Hours"
          description="Your weekly dispatch-board availability"
        />
        <LinkCard
          href="/settings/vault"
          title="Password Vault Shortcut"
          description="Toggle the DocHub vault link in the sidebar"
        />
        <LinkCard
          href="/api/auth/signout"
          title="Sign Out"
          description="End your session on this device"
        />
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-xs uppercase tracking-wider text-th-text-muted">
        {label}
      </dt>
      <dd className="text-sm text-slate-200">{value}</dd>
    </div>
  )
}

function LinkCard({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group block rounded-md border border-th-border bg-th-surface p-4 transition-colors hover:border-accent/50 hover:bg-th-elevated"
    >
      <div className="font-medium text-slate-100 group-hover:text-accent">
        {title}
      </div>
      <div className="mt-1 text-xs text-th-text-secondary">{description}</div>
    </Link>
  )
}
