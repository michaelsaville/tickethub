import { Sidebar } from '@/app/components/layout/Sidebar'
import { MobileBottomBar } from '@/app/components/layout/MobileBottomBar'
import { TimerBar } from '@/app/components/TimerBar'
import { InstallPrompt } from '@/app/components/InstallPrompt'
import { SyncStatusBadge } from '@/app/components/SyncStatusBadge'
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
  if (session?.user?.id) {
    const u = await prisma.tH_User.findUnique({
      where: { id: session.user.id },
      select: { showVaultLink: true },
    })
    showVaultLink = u?.showVaultLink ?? true
  }

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
        <Sidebar showVaultLink={showVaultLink} />
      </div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <InstallPrompt />
        <TimerBar initial={timerBarProps} />
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</div>
      </main>
      <MobileBottomBar />
      <SyncStatusBadge />
    </div>
  )
}
