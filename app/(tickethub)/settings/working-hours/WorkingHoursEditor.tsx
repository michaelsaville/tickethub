'use client'

import { useState, useTransition } from 'react'
import type { DaySchedule } from '@/app/lib/actions/working-hours'
import { updateWorkingHours } from '@/app/lib/actions/working-hours'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  techId: string
  techName: string
  initialSchedule: DaySchedule[]
}

export function WorkingHoursEditor({ techId, techName, initialSchedule }: Props) {
  const [schedule, setSchedule] = useState<DaySchedule[]>(initialSchedule)
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function updateDay(dayOfWeek: number, field: keyof DaySchedule, value: string | boolean) {
    setSchedule((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d)),
    )
    setSaved(false)
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateWorkingHours(techId, schedule)
      if (result.ok) setSaved(true)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-mono text-lg text-slate-100">{techName}</h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1 pr-3 font-medium">Day</th>
              <th className="py-1 pr-3 font-medium">Working</th>
              <th className="py-1 pr-3 font-medium">Start</th>
              <th className="py-1 font-medium">End</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((day) => (
              <tr key={day.dayOfWeek} className={!day.isWorkingDay ? 'opacity-40' : ''}>
                <td className="py-1.5 pr-3 font-mono text-slate-200">
                  {DAY_LABELS[day.dayOfWeek]}
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    checked={day.isWorkingDay}
                    onChange={(e) => updateDay(day.dayOfWeek, 'isWorkingDay', e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-elevated accent-amber-500"
                  />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) => updateDay(day.dayOfWeek, 'startTime', e.target.value)}
                    disabled={!day.isWorkingDay}
                    className="rounded border border-border bg-elevated px-2 py-1 text-slate-200 disabled:opacity-30"
                  />
                </td>
                <td className="py-1.5">
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) => updateDay(day.dayOfWeek, 'endTime', e.target.value)}
                    disabled={!day.isWorkingDay}
                    className="rounded border border-border bg-elevated px-2 py-1 text-slate-200 disabled:opacity-30"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-sm text-emerald-400">Saved</span>}
      </div>
    </div>
  )
}
