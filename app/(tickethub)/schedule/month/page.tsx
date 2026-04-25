import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { prisma } from '@/app/lib/prisma'
import { MonthView } from './MonthView'

export const dynamic = 'force-dynamic'

function parseMonth(monthStr?: string): Date {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split('-').map(Number)
    return new Date(y, m - 1, 1)
  }
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export default async function MonthSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const params = await searchParams
  const monthStart = parseMonth(params.m)
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  // Pull a wide window to cover the leading/trailing days the month grid
  // shows from neighboring months (calendar grids span 5–6 weeks).
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()) // back to Sun
  const gridEnd = new Date(gridStart)
  gridEnd.setDate(gridEnd.getDate() + 42)

  const appointments = await prisma.tH_Appointment.findMany({
    where: {
      scheduledStart: { gte: gridStart, lt: gridEnd },
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      technicianId: true,
      scheduledStart: true,
      scheduledEnd: true,
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          priority: true,
          client: { select: { name: true, shortCode: true } },
        },
      },
      technician: { select: { id: true, name: true } },
    },
    orderBy: { scheduledStart: 'asc' },
  })

  return (
    <MonthView
      monthStart={monthStart.toISOString()}
      appointments={JSON.parse(JSON.stringify(appointments))}
    />
  )
}
