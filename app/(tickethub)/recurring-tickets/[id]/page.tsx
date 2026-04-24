import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { hasMinRole, requireAuth } from '@/app/lib/api-auth'
import { updateRecurringTemplate } from '@/app/lib/actions/recurring-tickets'
import { TemplateForm, type TemplateFormInitial } from '../TemplateForm'
import { RunNowButton } from './RunNowButton'

export const dynamic = 'force-dynamic'

export default async function EditRecurringTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  if (!hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')) {
    redirect('/recurring-tickets')
  }

  const { id } = await params
  const template = await prisma.tH_RecurringTicketTemplate.findUnique({
    where: { id },
    include: {
      tickets: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          createdAt: true,
        },
      },
    },
  })
  if (!template) notFound()

  const [clients, techs] = await Promise.all([
    prisma.tH_Client.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        shortCode: true,
        sites: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        contacts: {
          where: { isActive: true },
          select: { id: true, firstName: true, lastName: true, isPrimary: true },
          orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
        },
        contracts: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }],
        },
      },
    }),
    prisma.tH_User.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const initial: TemplateFormInitial = {
    name: template.name,
    clientId: template.clientId,
    siteId: template.siteId,
    contactId: template.contactId,
    contractId: template.contractId,
    assignedToId: template.assignedToId,
    title: template.title,
    description: template.description,
    priority: template.priority,
    type: template.type,
    frequency: template.frequency,
    interval: template.interval,
    dayOfWeek: template.dayOfWeek,
    dayOfMonth: template.dayOfMonth,
    hourOfDay: template.hourOfDay,
    minuteOfHour: template.minuteOfHour,
    timezone: template.timezone,
    active: template.active,
  }

  const action = updateRecurringTemplate.bind(null, id)

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Link
            href="/recurring-tickets"
            className="text-xs text-th-text-secondary hover:text-accent"
          >
            ← Recurring Tickets
          </Link>
          <h1 className="mt-2 font-mono text-2xl text-slate-100">
            {template.name}
          </h1>
          <p className="mt-1 text-xs text-th-text-muted">
            {template.runCount} total spawns
            {template.lastRunAt && (
              <> · last run {new Date(template.lastRunAt).toLocaleString()}</>
            )}
            {template.active && (
              <> · next {new Date(template.nextRunAt).toLocaleString('en-US', {
                timeZone: template.timezone,
                dateStyle: 'medium',
                timeStyle: 'short',
              })} ({template.timezone})</>
            )}
          </p>
        </div>
        <RunNowButton templateId={template.id} />
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TemplateForm
            clients={clients}
            techs={techs}
            action={action}
            initial={initial}
            successHref={`/recurring-tickets/${template.id}`}
            submitLabel="Save changes"
          />
        </div>

        <aside className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Recent spawned tickets
          </h2>
          {template.tickets.length === 0 ? (
            <p className="rounded-lg border border-th-border bg-th-surface p-4 text-sm text-th-text-secondary">
              No tickets spawned yet.
            </p>
          ) : (
            <ul className="divide-y divide-th-border overflow-hidden rounded-lg border border-th-border bg-th-surface">
              {template.tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.id}`}
                    className="block px-4 py-3 hover:bg-th-elevated"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-th-text-muted">
                        #{t.ticketNumber}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-th-text-muted">
                        {t.status}
                      </span>
                    </div>
                    <div className="truncate text-sm text-slate-200">{t.title}</div>
                    <div className="text-xs text-th-text-muted">
                      {new Date(t.createdAt).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
