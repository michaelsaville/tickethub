'use client'

import { useMemo } from 'react'

export type DateRange = { start: string; end: string }

type Props = {
  startDate: string
  endDate: string
  onChange: (range: DateRange) => void
}

/** ISO date string for a Date (YYYY-MM-DD). */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type Preset = { label: string; range: () => DateRange }

function usePresets(): Preset[] {
  return useMemo(() => {
    const today = new Date()
    const y = today.getFullYear()
    const m = today.getMonth()

    return [
      {
        label: 'Last 7 Days',
        range: () => {
          const s = new Date(today)
          s.setDate(s.getDate() - 6)
          return { start: iso(s), end: iso(today) }
        },
      },
      {
        label: 'Last 30 Days',
        range: () => {
          const s = new Date(today)
          s.setDate(s.getDate() - 29)
          return { start: iso(s), end: iso(today) }
        },
      },
      {
        label: 'This Month',
        range: () => ({
          start: iso(new Date(y, m, 1)),
          end: iso(today),
        }),
      },
      {
        label: 'Last Month',
        range: () => ({
          start: iso(new Date(y, m - 1, 1)),
          end: iso(new Date(y, m, 0)),
        }),
      },
      {
        label: 'This Quarter',
        range: () => {
          const q = Math.floor(m / 3) * 3
          return { start: iso(new Date(y, q, 1)), end: iso(today) }
        },
      },
      {
        label: 'Last Quarter',
        range: () => {
          const q = Math.floor(m / 3) * 3
          return {
            start: iso(new Date(y, q - 3, 1)),
            end: iso(new Date(y, q, 0)),
          }
        },
      },
      {
        label: 'YTD',
        range: () => ({
          start: iso(new Date(y, 0, 1)),
          end: iso(today),
        }),
      },
    ]
  }, [])
}

export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const presets = usePresets()

  return (
    <div className="th-card space-y-3 p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        Date Range
      </p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const r = p.range()
          const active = r.start === startDate && r.end === endDate
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.range())}
              className={
                active
                  ? 'th-btn-primary px-2.5 py-1 text-xs'
                  : 'rounded-md border border-th-border bg-th-surface px-2.5 py-1 text-xs text-th-text-secondary hover:bg-th-elevated'
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Manual date inputs */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange({ start: e.target.value, end: endDate })}
          className="th-input text-sm"
        />
        <span className="text-xs text-th-text-secondary">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange({ start: startDate, end: e.target.value })}
          className="th-input text-sm"
        />
      </div>
    </div>
  )
}
