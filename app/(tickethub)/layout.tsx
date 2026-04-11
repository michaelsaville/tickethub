import { Sidebar } from '@/app/components/layout/Sidebar'
import { MobileBottomBar } from '@/app/components/layout/MobileBottomBar'
import { TimerBar } from '@/app/components/TimerBar'
import { InstallPrompt } from '@/app/components/InstallPrompt'
import { getMyTimer } from '@/app/lib/actions/timer'

export default async function TicketHubLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
        <Sidebar />
      </div>
      <main className="flex flex-1 flex-col overflow-hidden">
        <InstallPrompt />
        <TimerBar initial={timerBarProps} />
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</div>
      </main>
      <MobileBottomBar />
    </div>
  )
}
