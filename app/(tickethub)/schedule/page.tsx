import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import {
  getAppointmentsForWeek,
  getUnscheduledTickets,
  getActiveTechs,
} from '@/app/lib/actions/appointments'
import { getAllWorkingHours } from '@/app/lib/actions/working-hours'
import { isAutomationEnabled } from '@/app/lib/settings'
import { DispatchBoard } from './DispatchBoard'

export const dynamic = 'force-dynamic'

function getWeekStart(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr) : new Date()
  // Roll back to Monday
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const params = await searchParams
  const weekStart = getWeekStart(params.week)

  const [appointments, unscheduledTickets, techs, workingHours, onsiteEnabled] =
    await Promise.all([
      getAppointmentsForWeek(weekStart),
      getUnscheduledTickets(),
      getActiveTechs(),
      getAllWorkingHours(),
      isAutomationEnabled('onsite_workflow.enabled'),
    ])

  return (
    <DispatchBoard
      weekStart={weekStart.toISOString()}
      appointments={JSON.parse(JSON.stringify(appointments))}
      unscheduledTickets={JSON.parse(JSON.stringify(unscheduledTickets))}
      techs={JSON.parse(JSON.stringify(techs))}
      workingHours={workingHours}
      onsiteEnabled={onsiteEnabled}
    />
  )
}
