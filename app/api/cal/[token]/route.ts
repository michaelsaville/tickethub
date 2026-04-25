import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/app/lib/prisma'

/**
 * Public read-only ICS calendar feed. Authenticated by the per-user
 * `icsToken` random secret. Excluded from the next-auth middleware
 * matcher (`api/cal`) so calendar clients can poll without a session.
 *
 * Returns appointments for the matching tech across a sliding window:
 *   - 30 days in the past (for "what did I do last week?")
 *   - 90 days into the future (most calendar clients only fetch ~60d ahead)
 *
 * Cancelled appointments are emitted with STATUS:CANCELLED so already-
 * synced events get retracted client-side instead of lingering.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 16) {
    return new NextResponse('Not found', { status: 404 })
  }

  const user = await prisma.tH_User.findUnique({
    where: { icsToken: token },
    select: { id: true, name: true, isActive: true },
  })
  if (!user || !user.isActive) {
    return new NextResponse('Not found', { status: 404 })
  }

  const now = new Date()
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const appointments = await prisma.tH_Appointment.findMany({
    where: {
      technicianId: user.id,
      scheduledStart: { gte: windowStart, lte: windowEnd },
    },
    orderBy: { scheduledStart: 'asc' },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          client: {
            select: {
              name: true,
              sites: {
                select: {
                  address: true,
                  city: true,
                  state: true,
                  zip: true,
                },
                take: 1,
              },
            },
          },
          site: {
            select: {
              name: true,
              address: true,
              city: true,
              state: true,
              zip: true,
            },
          },
        },
      },
    },
  })

  const tzId = 'America/New_York'
  const baseOrigin =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? 'https://tickethub.pcc2k.com'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PCC2K//TicketHub//EN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:TicketHub — ${escape(user.name)}`,
    `X-WR-TIMEZONE:${tzId}`,
    'CALSCALE:GREGORIAN',
  ]

  const stamp = formatIcsUtc(now)

  for (const a of appointments) {
    const ticket = a.ticket
    const site = ticket.site ?? ticket.client.sites[0] ?? null
    const summary = `#${ticket.ticketNumber} — ${ticket.client.name}: ${ticket.title}`
    const description = [
      `Client: ${ticket.client.name}`,
      `Status: ${a.status}`,
      a.notes ? `Notes: ${a.notes}` : null,
      `Open in TicketHub: ${baseOrigin}/tickets/${ticket.id}`,
    ]
      .filter(Boolean)
      .join('\\n')
    const location = site
      ? [site.address, site.city, site.state, site.zip].filter(Boolean).join(', ')
      : ''

    lines.push(
      'BEGIN:VEVENT',
      `UID:appointment-${a.id}@tickethub.pcc2k.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsUtc(a.scheduledStart)}`,
      `DTEND:${formatIcsUtc(a.scheduledEnd)}`,
      `SUMMARY:${escape(summary)}`,
      `DESCRIPTION:${escape(description)}`,
      ...(location ? [`LOCATION:${escape(location)}`] : []),
      `URL:${baseOrigin}/tickets/${ticket.id}`,
      `STATUS:${a.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  // Use CRLF per RFC 5545. Most clients also accept LF, but spec is spec.
  const body = lines.join('\r\n') + '\r\n'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
      // Calendar clients re-poll every ~15min. 60s cache is a safety net
      // against accidental hammering during testing.
    },
  })
}

function formatIcsUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ in UTC
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function escape(s: string): string {
  // Per RFC 5545: escape backslash, comma, semicolon, newlines.
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}
