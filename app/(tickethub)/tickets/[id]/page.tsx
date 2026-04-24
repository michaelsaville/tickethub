import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth, hasMinRole } from '@/app/lib/api-auth'
import { SlaBadge } from '@/app/components/SlaBadge'
import { TicketProperties } from './TicketProperties'
import { CommentComposer } from './CommentComposer'
import { Attachments } from './Attachments'
import { QuickCharge } from './QuickCharge'
import { ReceiptScanner } from './ReceiptScanner'
import { ChargesTable } from './ChargesTable'
import { TimerControls } from './TimerControls'
import { PartsCard } from './PartsCard'
import { ChecklistCard } from './ChecklistCard'
import { SignatureCard } from './SignatureCard'
import { PendingCommentList } from './PendingCommentList'
import { SuggestedResolution } from './SuggestedResolution'
import { TodoistButton } from './TodoistButton'
import { TagsInput } from './TagsInput'
import { ConvertToKbButton } from './ConvertToKbButton'
import { DochubAssetPicker } from './DochubAssetPicker'
import { AppointmentsCard } from './AppointmentsCard'
import type { ChecklistItem } from '@/app/lib/actions/checklist'
import { getMyTimer } from '@/app/lib/actions/timer'
import { getAppointmentsForTicket } from '@/app/lib/actions/appointments'
import { isAutomationEnabled } from '@/app/lib/settings'

export const dynamic = 'force-dynamic'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')
  const canSeeAmounts = hasMinRole(session!.user.role, 'TICKETHUB_ADMIN')

  const { id } = await params
  const ticket = await prisma.tH_Ticket.findUnique({
    where: { id },
    include: {
      client: {
        include: {
          tickets: {
            where: {
              id: { not: id },
              deletedAt: null,
              status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
            },
            orderBy: { updatedAt: 'desc' },
            take: 8,
            select: {
              id: true,
              ticketNumber: true,
              title: true,
              status: true,
              priority: true,
            },
          },
          contracts: {
            where: { OR: [{ status: 'ACTIVE' }, { isGlobal: true }] },
            orderBy: [{ isGlobal: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              name: true,
              type: true,
              isGlobal: true,
            },
          },
        },
      },
      contact: true,
      site: true,
      contract: true,
      asset: true,
      recurringTemplate: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: 'desc' } },
      parts: { orderBy: { createdAt: 'desc' } },
      signatures: { orderBy: { createdAt: 'desc' } },
      tags: { select: { tag: true }, orderBy: { tag: 'asc' } },
      charges: {
        orderBy: { workDate: 'desc' },
        include: {
          item: { select: { name: true, code: true } },
          technician: { select: { name: true } },
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
      timeline: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })
  if (!ticket || ticket.deletedAt) notFound()

  // Clear unread flag on staff view
  if (ticket.isUnread) {
    await prisma.tH_Ticket.update({
      where: { id },
      data: { isUnread: false },
    })
  }

  const myTimer = await getMyTimer()
  const [techs, onsiteTechs, items, checklistTemplates, appointments, onsiteEnabled] =
    await Promise.all([
      prisma.tH_User.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.tH_User.findMany({
        where: { isActive: true, isOnsiteTech: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.tH_Item.findMany({
        where: { isActive: true },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, type: true, code: true },
      }),
      prisma.tH_ChecklistTemplate.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      getAppointmentsForTicket(id),
      isAutomationEnabled('onsite_workflow.enabled'),
    ])

  type TimelineEntry =
    | { kind: 'comment'; at: Date; data: (typeof ticket.comments)[number] }
    | { kind: 'event'; at: Date; data: (typeof ticket.timeline)[number] }
  const merged: TimelineEntry[] = [
    ...ticket.comments.map<TimelineEntry>((c) => ({
      kind: 'comment',
      at: c.createdAt,
      data: c,
    })),
    ...ticket.timeline
      .filter((e) => e.type !== 'COMMENT' && e.type !== 'INTERNAL_NOTE')
      .map<TimelineEntry>((e) => ({ kind: 'event', at: e.createdAt, data: e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime())

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/tickets"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Back to tickets
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-sm text-th-text-muted">
            #{ticket.ticketNumber}
          </span>
          <h1 className="font-mono text-2xl text-slate-100">{ticket.title}</h1>
        </div>
        <div className="mt-1 text-xs text-th-text-secondary">
          Opened by {ticket.createdBy.name} ·{' '}
          <Link
            href={`/clients/${ticket.client.id}`}
            className="hover:text-accent"
          >
            {ticket.client.name}
          </Link>
          {ticket.contact && ` · ${ticket.contact.firstName} ${ticket.contact.lastName}`}
        </div>
        {ticket.recurringTemplate && (
          <div className="mt-2">
            <Link
              href={`/recurring-tickets/${ticket.recurringTemplate.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/20"
            >
              <span aria-hidden>↻</span>
              From recurring: {ticket.recurringTemplate.name}
            </Link>
          </div>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[260px,1fr,300px]">
        {/* Left: Properties */}
        <div>
          <TicketProperties
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            assignedToId={ticket.assignedToId}
            contractId={ticket.contractId}
            board={ticket.board}
            type={ticket.type}
            techs={techs}
            contracts={ticket.client.contracts.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              isGlobal: c.isGlobal,
            }))}
          />
          <div className="mt-3 rounded-lg border border-th-border/50 bg-th-surface p-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">Tags</p>
            <TagsInput ticketId={ticket.id} initial={ticket.tags} />
          </div>
          <div className="mt-4">
            <TimerControls
              ticketId={ticket.id}
              items={items}
              initial={
                myTimer
                  ? {
                      id: myTimer.id,
                      ticketId: myTimer.ticketId,
                      startedAtMs: myTimer.startedAt.getTime(),
                      pausedAtMs: myTimer.pausedAt
                        ? myTimer.pausedAt.getTime()
                        : null,
                      pausedMs: myTimer.pausedMs,
                    }
                  : null
              }
            />
          </div>
          <dl className="th-card mt-4 space-y-3 text-xs">
            {ticket.site && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Site
                </dt>
                <dd className="mt-1 text-slate-200">{ticket.site.name}</dd>
              </div>
            )}
            {ticket.contract && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  Contract
                </dt>
                {ticket.contract.type === 'BLOCK_HOURS' &&
                  ticket.contract.blockHours != null && (
                    <dd className="mt-1 font-mono text-xs text-slate-300">
                      {ticket.contract.blockHoursUsed.toFixed(1)} /{' '}
                      {ticket.contract.blockHours.toFixed(1)} hrs used
                    </dd>
                  )}
                <dd className="mt-1 text-slate-200">
                  {ticket.contract.name}
                  <span className="ml-2 text-th-text-muted">
                    {ticket.contract.type}
                  </span>
                </dd>
              </div>
            )}
            <DochubAssetPicker
              ticketId={ticket.id}
              clientName={ticket.client.name}
              linkedAssetId={ticket.dochubAssetId}
              linkedAssetName={ticket.dochubAssetName}
            />
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Created
              </dt>
              <dd className="mt-1 text-slate-300">
                {ticket.createdAt.toLocaleString()}
              </dd>
            </div>
            {ticket.slaResolveDue && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                  SLA
                </dt>
                <dd className="mt-1">
                  <SlaBadge ticket={ticket} />
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Middle: Description + Timeline + Composer */}
        <div className="space-y-4">
          {ticket.description && (
            <div className="th-card">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Description
              </div>
              <div className="whitespace-pre-wrap text-sm text-slate-200">
                {ticket.description}
              </div>
            </div>
          )}

          <div className="th-card">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Timeline
            </div>
            {merged.length === 0 ? (
              <p className="text-xs text-th-text-muted">
                No activity yet. Add the first comment below.
              </p>
            ) : (
              <ol className="space-y-3">
                {merged.map((entry, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 flex-none rounded-full bg-accent/60" />
                    <div className="flex-1 text-sm">
                      {entry.kind === 'comment' ? (
                        <CommentRow comment={entry.data} />
                      ) : (
                        <EventRow event={entry.data} />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <PendingCommentList ticketId={ticket.id} />
          </div>

          <AppointmentsCard
            ticketId={ticket.id}
            ticketBoard={ticket.board}
            estimatedMinutes={ticket.estimatedMinutes}
            techs={onsiteTechs}
            appointments={appointments.map((a) => ({
              id: a.id,
              scheduledStart: a.scheduledStart.toISOString(),
              scheduledEnd: a.scheduledEnd.toISOString(),
              status: a.status,
              confirmationEmailSentAt: a.confirmationEmailSentAt
                ? a.confirmationEmailSentAt.toISOString()
                : null,
              technician: a.technician,
            }))}
            onsiteEnabled={onsiteEnabled}
          />

          <ChecklistCard
            ticketId={ticket.id}
            items={items}
            initial={
              Array.isArray(ticket.checklist)
                ? (ticket.checklist as unknown as ChecklistItem[])
                : []
            }
            templates={checklistTemplates}
          />

          <div id="log-time">
            <QuickCharge ticketId={ticket.id} items={items} />
          </div>

          <ReceiptScanner ticketId={ticket.id} items={items} />

          <div id="add-part"><PartsCard
            ticketId={ticket.id}
            items={items}
            initial={ticket.parts.map((p) => ({
              id: p.id,
              name: p.name,
              quantity: p.quantity,
              unitCost: p.unitCost,
              unitPrice: p.unitPrice,
              vendor: p.vendor,
              vendorUrl: p.vendorUrl,
              orderNumber: p.orderNumber,
              status: p.status,
              chargeId: p.chargeId,
            }))}
            showAmounts={canSeeAmounts}
          /></div>

          <ChargesTable charges={ticket.charges} showAmounts={canSeeAmounts} />

          <div id="add-photo"><Attachments
            ticketId={ticket.id}
            initial={ticket.attachments.map((a) => ({
              id: a.id,
              filename: a.filename,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              createdAt: a.createdAt,
            }))}
          /></div>

          <SignatureCard
            ticketId={ticket.id}
            initial={ticket.signatures.map((s) => ({
              id: s.id,
              signedByName: s.signedByName,
              createdAt: s.createdAt,
            }))}
          />

          <div id="add-note">
            <CommentComposer ticketId={ticket.id} />
          </div>
        </div>

        {/* Right: Client Context */}
        <aside className="space-y-4">
          <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Client Context
          </h2>
          {ticket.client.internalNotes && (
            <div className="th-card border-accent/40 bg-accent/5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                Internal Notes
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs text-slate-200">
                {ticket.client.internalNotes}
              </p>
            </div>
          )}
          <div className="th-card">
            <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Other Open Tickets ({ticket.client.tickets.length})
            </div>
            {ticket.client.tickets.length === 0 ? (
              <p className="mt-2 text-xs text-th-text-muted">
                No other open tickets for this client.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {ticket.client.tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="text-slate-300 hover:text-accent"
                    >
                      <span className="font-mono text-th-text-muted">
                        #{t.ticketNumber}
                      </span>{' '}
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SuggestedResolution ticketId={ticket.id} />
          <TodoistButton ticketId={ticket.id} />
          <ConvertToKbButton ticketId={ticket.id} ticketStatus={ticket.status} />
        </aside>
      </div>
    </div>
  )
}

function CommentRow({
  comment,
}: {
  comment: {
    body: string
    isInternal: boolean
    createdAt: Date
    author: { name: string }
  }
}) {
  return (
    <div
      className={
        comment.isInternal
          ? 'rounded-md border border-accent/30 bg-accent/5 p-3'
          : 'rounded-md border border-th-border bg-th-base p-3'
      }
    >
      <div className="flex items-baseline gap-2 text-xs">
        <span className="font-medium text-slate-200">{comment.author.name}</span>
        {comment.isInternal && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            Internal
          </span>
        )}
        <span className="ml-auto text-th-text-muted">
          {comment.createdAt.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-100">
        {comment.body}
      </div>
    </div>
  )
}

function EventRow({
  event,
}: {
  event: {
    type: string
    data: unknown
    createdAt: Date
    user: { name: string } | null
  }
}) {
  const data = (event.data ?? {}) as Record<string, unknown>
  let label = event.type
  if (event.type === 'STATUS_CHANGE') {
    label = `Status: ${String(data.from)} → ${String(data.to)}`
  } else if (event.type === 'PRIORITY_CHANGE') {
    label = `Priority: ${String(data.from)} → ${String(data.to)}`
  } else if (event.type === 'ASSIGNED') {
    label = data.to ? `Assigned` : `Unassigned`
  } else if (event.type === 'CREATED') {
    label = 'Ticket created'
  }
  return (
    <div className="text-xs text-th-text-secondary">
      <span className="text-slate-300">{event.user?.name ?? 'System'}</span>{' '}
      <span>· {label}</span>
      <span className="ml-2 text-th-text-muted">
        {event.createdAt.toLocaleString()}
      </span>
    </div>
  )
}
