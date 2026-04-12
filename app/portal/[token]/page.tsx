import { prisma } from '@/app/lib/prisma'
import { PortalView } from './PortalView'

export const dynamic = 'force-dynamic'

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const portalToken = await prisma.tH_ContactPortalToken.findUnique({
    where: { token },
    select: {
      id: true,
      isActive: true,
      expiresAt: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          client: { select: { name: true } },
        },
      },
    },
  })

  if (
    !portalToken ||
    !portalToken.isActive ||
    (portalToken.expiresAt && portalToken.expiresAt < new Date())
  ) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-mono text-slate-100">
          Link Expired or Invalid
        </h1>
        <p className="mt-2 text-sm text-th-text-secondary">
          This portal link is no longer active. Please contact PCC2K for a new
          link.
        </p>
      </div>
    )
  }

  const reminders = await prisma.tH_Reminder.findMany({
    where: {
      contactId: portalToken.contact.id,
      status: { in: ['ACTIVE', 'SNOOZED'] },
    },
    orderBy: { nextNotifyAt: 'asc' },
  })

  return (
    <PortalView
      token={token}
      contactName={`${portalToken.contact.firstName} ${portalToken.contact.lastName}`}
      companyName={portalToken.contact.client.name}
      reminders={reminders.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        actionUrl: r.actionUrl,
        source: r.source,
        status: r.status,
        recurrence: r.recurrence,
        dueDate: r.dueDate?.toISOString() ?? null,
        nextNotifyAt: r.nextNotifyAt.toISOString(),
        notifyCount: r.notifyCount,
      }))}
    />
  )
}
