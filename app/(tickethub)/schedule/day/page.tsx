import { redirect } from 'next/navigation'
import { requireAuth } from '@/app/lib/api-auth'
import { getActiveTechs } from '@/app/lib/actions/appointments'
import { prisma } from '@/app/lib/prisma'
import { DayView } from './DayView'

export const dynamic = 'force-dynamic'

function parseDate(dateStr?: string): Date {
  const d = dateStr ? new Date(dateStr) : new Date()
  if (Number.isNaN(d.getTime())) return new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default async function DaySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>
}) {
  const { error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const params = await searchParams
  const dayStart = parseDate(params.d)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const [appointments, techs] = await Promise.all([
    prisma.tH_Appointment.findMany({
      where: {
        scheduledStart: { gte: dayStart, lt: dayEnd },
        status: { not: 'CANCELLED' },
      },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            priority: true,
            status: true,
            client: { select: { id: true, name: true, shortCode: true } },
            site: { select: { id: true, name: true } },
          },
        },
        technician: { select: { id: true, name: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
    getActiveTechs(),
  ])

  return (
    <DayView
      dayStart={dayStart.toISOString()}
      appointments={JSON.parse(JSON.stringify(appointments))}
      techs={JSON.parse(JSON.stringify(techs))}
    />
  )
}
