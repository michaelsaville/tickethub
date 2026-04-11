import { Sidebar } from '@/app/components/layout/Sidebar'
import { TimerBar } from '@/app/components/TimerBar'
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
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <TimerBar initial={timerBarProps} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
