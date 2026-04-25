import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'
import { CalendarFeedClient } from './CalendarFeedClient'

export const dynamic = 'force-dynamic'

const ORIGIN =
  process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? 'https://tickethub.pcc2k.com'

export default async function CalendarFeedPage() {
  const { session, error } = await requireAuth()
  if (error) redirect('/api/auth/signin')

  const user = await prisma.tH_User.findUnique({
    where: { id: session!.user.id },
    select: { icsToken: true },
  })
  const token = user?.icsToken ?? null
  const url = token ? `${ORIGIN}/api/cal/${token}` : null

  return (
    <div className="p-6">
      <header className="mb-6">
        <Link
          href="/settings"
          className="text-xs text-th-text-secondary hover:text-accent"
        >
          ← Settings
        </Link>
        <h1 className="mt-2 font-mono text-2xl text-slate-100">
          Calendar Feed (ICS)
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-th-text-secondary">
          Subscribe to a read-only feed of <em>your</em> scheduled
          TicketHub appointments from Outlook, Google Calendar, Apple
          Calendar — anywhere that accepts an ICS URL. The feed covers
          30 days back through 90 days ahead and refreshes every time
          your calendar app polls (typically every 15 min).
        </p>
      </header>

      <CalendarFeedClient initialUrl={url} />

      <section className="mt-8 max-w-2xl space-y-3 text-sm text-th-text-secondary">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          How to subscribe
        </h2>
        <details className="rounded-md border border-th-border bg-th-surface p-3">
          <summary className="cursor-pointer text-slate-200">
            Outlook (Microsoft 365 / Outlook on the web)
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>
              In Outlook, go to <strong>Calendar → Add calendar → Subscribe
              from web</strong>.
            </li>
            <li>Paste the URL above. Name it &ldquo;TicketHub.&rdquo;</li>
            <li>
              Pick a color &amp; charm. Outlook polls roughly every 3 hours
              for subscribed calendars.
            </li>
          </ol>
        </details>
        <details className="rounded-md border border-th-border bg-th-surface p-3">
          <summary className="cursor-pointer text-slate-200">
            Google Calendar
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>
              Open <a className="text-accent hover:underline" href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer">calendar.google.com → + → From URL</a>.
            </li>
            <li>Paste the URL and click <strong>Add calendar</strong>.</li>
            <li>
              Google polls every ~12–24 hours. If you need faster updates,
              use Apple Calendar or an Outlook desktop client.
            </li>
          </ol>
        </details>
        <details className="rounded-md border border-th-border bg-th-surface p-3">
          <summary className="cursor-pointer text-slate-200">
            Apple Calendar (macOS / iOS)
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>
              macOS: <strong>File → New Calendar Subscription…</strong>;
              iOS: <strong>Settings → Calendar → Accounts → Add → Other
              → Add Subscribed Calendar</strong>.
            </li>
            <li>Paste the URL and accept defaults.</li>
            <li>
              Apple lets you set the auto-refresh interval; 15min is
              usually fine.
            </li>
          </ol>
        </details>
      </section>

      <section className="mt-6 max-w-2xl space-y-2 text-xs text-th-text-muted">
        <p>
          <strong>Important:</strong> the URL contains a secret token. If you
          paste it anywhere public — Slack, an email signature, etc. —
          regenerate immediately. Regenerating revokes the old URL; every
          subscribed device will need to re-subscribe.
        </p>
        <p>
          The feed is one-way: changes you make in Outlook / Google /
          Apple do <em>not</em> push back to TicketHub. To reschedule
          an appointment, use the dispatch board.
        </p>
      </section>
    </div>
  )
}
