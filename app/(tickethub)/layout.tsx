import { Sidebar } from '@/app/components/layout/Sidebar'
import { MobileBottomBar } from '@/app/components/layout/MobileBottomBar'
import { TimerBar } from '@/app/components/TimerBar'
import { InstallPrompt } from '@/app/components/InstallPrompt'
import { SyncStatusBadge } from '@/app/components/SyncStatusBadge'
import { LocationTracker } from '@/app/components/LocationTracker'
import { getMyTimer } from '@/app/lib/actions/timer'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'

export default async function TicketHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  let showVaultLink = false
  let isAdmin = false
  if (session?.user?.id) {
    const u = await prisma.tH_User.findUnique({
      where: { id: session.user.id },
      select: { showVaultLink: true, role: true },
    })
    showVaultLink = u?.showVaultLink ?? true
    isAdmin = u?.role === 'TICKETHUB_ADMIN' || u?.role === 'GLOBAL_ADMIN'
  }

  const [
    pendingInboxCount,
    newTicketCount,
    unpaidInvoiceCount,
    pendingEstimateCount,
    unreadNotificationCount,
    pendingTimeApprovalCount,
  ] = await Promise.all([
    prisma.tH_PendingInboundEmail.count({ where: { status: 'PENDING' } }),
    prisma.tH_Ticket.count({ where: { status: 'NEW' } }),
    prisma.tH_Invoice.count({
      where: { status: { in: ['SENT', 'VIEWED', 'OVERDUE'] } },
    }),
    prisma.tH_Estimate.count({ where: { status: { in: ['SENT'] } } }),
    session?.user?.id
      ? prisma.tH_Notification.count({
          where: { userId: session.user.id, isRead: false },
        })
      : Promise.resolve(0),
    isAdmin
      ? prisma.tH_Charge.count({
          where: { status: 'PENDING_REVIEW', type: 'LABOR' },
        })
      : Promise.resolve(0),
  ])

  const timer = await getMyTimer()
  const timerBarProps = timer
    ? {
        ticketId: timer.ticketId,
        ticketNumber: timer.ticketNumber,
        ticketTitle: timer.ticketTitle,
        startedAtMs: timer.startedAt.getTime(),
        pausedAtMs: timer.pausedAt ? timer.pausedAt.getTime() : null,
        pausedMs: timer.pausedMs,
      }
    : null

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar — hidden below md */}
      <div className="hidden md:block">
        <Sidebar
          showVaultLink={showVaultLink}
          showTimeApprovals={isAdmin}
          inboxCount={pendingInboxCount}
          ticketCount={newTicketCount}
          invoiceCount={unpaidInvoiceCount}
          estimateCount={pendingEstimateCount}
          notificationCount={unreadNotificationCount}
          timeApprovalCount={pendingTimeApprovalCount}
        />
      </div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <InstallPrompt />
        <TimerBar initial={timerBarProps} />
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</div>
      </main>
      <MobileBottomBar
        inboxCount={pendingInboxCount}
        ticketCount={newTicketCount}
        invoiceCount={unpaidInvoiceCount}
        estimateCount={pendingEstimateCount}
        notificationCount={unreadNotificationCount}
      />
      <SyncStatusBadge />
      <LocationTracker />
    </div>
  )
}
