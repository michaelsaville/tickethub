import Link from 'next/link'

type View = 'week' | 'day' | 'month'

const TABS: { view: View; href: string; label: string }[] = [
  { view: 'week', href: '/schedule', label: 'Week' },
  { view: 'day', href: '/schedule/day', label: 'Day' },
  { view: 'month', href: '/schedule/month', label: 'Month' },
]

export function SchedulerViewTabs({ current }: { current: View }) {
  return (
    <div className="flex gap-1 rounded-lg border border-th-border bg-th-surface p-1">
      {TABS.map((t) => (
        <Link
          key={t.view}
          href={t.href}
          className={`rounded px-3 py-1 text-xs font-medium transition ${
            current === t.view
              ? 'bg-amber-600/30 text-amber-300'
              : 'text-th-text-secondary hover:bg-th-elevated'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
