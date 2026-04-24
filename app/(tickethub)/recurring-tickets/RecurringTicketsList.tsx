'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  toggleRecurringTemplate,
  deleteRecurringTemplate,
} from '@/app/lib/actions/recurring-tickets'

interface TemplateRow {
  id: string
  name: string
  active: boolean
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  hourOfDay: number
  minuteOfHour: number
  timezone: string
  nextRunAt: Date
  lastRunAt: Date | null
  runCount: number
  client: { name: string; shortCode: string | null }
  assignedTo: { name: string } | null
  _count: { tickets: number }
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function describeSchedule(t: TemplateRow): string {
  const time = `${String(t.hourOfDay).padStart(2, '0')}:${String(t.minuteOfHour).padStart(2, '0')}`
  if (t.frequency === 'DAILY') {
    return t.interval === 1
      ? `Every day at ${time}`
      : `Every ${t.interval} days at ${time}`
  }
  if (t.frequency === 'WEEKLY') {
    const day = DAY_SHORT[t.dayOfWeek ?? 0]
    return t.interval === 1
      ? `Every ${day} at ${time}`
      : `Every ${t.interval} weeks on ${day} at ${time}`
  }
  return t.interval === 1
    ? `Every month on day ${t.dayOfMonth} at ${time}`
    : `Every ${t.interval} months on day ${t.dayOfMonth} at ${time}`
}

export function RecurringTicketsList({ templates }: { templates: TemplateRow[] }) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-th-border bg-th-surface p-8 text-center">
        <p className="text-sm text-th-text-secondary">
          No recurring templates yet.
        </p>
        <Link
          href="/recurring-tickets/new"
          className="mt-3 inline-block text-sm text-accent hover:underline"
        >
          Create your first template →
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-th-border bg-th-surface">
      <table className="w-full text-sm">
        <thead className="bg-th-elevated text-xs uppercase text-th-text-muted">
          <tr>
            <th className="px-4 py-2 text-left">Name</th>
            <th className="px-4 py-2 text-left">Client</th>
            <th className="px-4 py-2 text-left">Schedule</th>
            <th className="px-4 py-2 text-left">Next run</th>
            <th className="px-4 py-2 text-left">Runs</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-th-border">
          {templates.map((t) => (
            <Row key={t.id} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ t }: { t: TemplateRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <tr className={t.active ? '' : 'opacity-50'}>
      <td className="px-4 py-3">
        <Link
          href={`/recurring-tickets/${t.id}`}
          className="font-medium text-slate-100 hover:text-accent"
        >
          {t.name}
        </Link>
        {!t.active && (
          <span className="ml-2 rounded bg-th-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase text-th-text-muted">
            paused
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-th-text-secondary">
        {t.client.shortCode ?? t.client.name}
        {t.assignedTo && (
          <div className="text-xs text-th-text-muted">→ {t.assignedTo.name}</div>
        )}
      </td>
      <td className="px-4 py-3 text-th-text-secondary">
        <div>{describeSchedule(t)}</div>
        <div className="text-xs text-th-text-muted">{t.timezone}</div>
      </td>
      <td className="px-4 py-3 text-th-text-secondary">
        {t.active
          ? new Date(t.nextRunAt).toLocaleString('en-US', {
              timeZone: t.timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '—'}
      </td>
      <td className="px-4 py-3 text-th-text-secondary">
        <span className="font-mono">{t._count.tickets}</span>
        {t.lastRunAt && (
          <div className="text-xs text-th-text-muted">
            last {new Date(t.lastRunAt).toLocaleDateString()}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleRecurringTemplate(t.id, !t.active)
              router.refresh()
            })
          }
          className="mr-2 rounded border border-th-border px-2 py-1 text-xs text-slate-200 hover:border-accent disabled:opacity-50"
        >
          {t.active ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${t.name}"? Spawned tickets will be kept but un-tagged.`)) return
            startTransition(async () => {
              await deleteRecurringTemplate(t.id)
              router.refresh()
            })
          }}
          className="rounded border border-priority-urgent/40 px-2 py-1 text-xs text-priority-urgent hover:bg-priority-urgent/10 disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  )
}
