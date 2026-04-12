'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Tech = { id: string; name: string }

interface StopData {
  id: string
  latitude: number
  longitude: number
  arrivedAt: string
  departedAt: string | null
  durationMinutes: number | null
  nearestSite: {
    id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    client: { id: string; name: string; shortCode: string | null }
  } | null
  distanceMeters: number | null
  ticketCreated: boolean
  ticketId: string | null
}

export function FieldActivityReport({
  techs,
  currentUserId,
  isAdmin,
}: {
  techs: Tech[]
  currentUserId: string
  isAdmin: boolean
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [userId, setUserId] = useState(currentUserId)
  const [stops, setStops] = useState<StopData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/location/stops?date=${date}&userId=${userId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setStops(json.data.stops)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [date, userId])

  const missedStops = stops.filter(
    (s) =>
      s.nearestSite &&
      !s.ticketCreated &&
      (s.durationMinutes ?? 0) >= 10,
  )
  const totalStops = stops.length
  const siteStops = stops.filter((s) => s.nearestSite).length

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="th-input"
          />
        </div>
        {isAdmin && (
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Technician
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="th-input"
            >
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.id === currentUserId ? ' (me)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-slate-100">{totalStops}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Total Stops
          </div>
        </div>
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-slate-100">{siteStops}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            At Client Sites
          </div>
        </div>
        <div className="th-card text-center">
          <div className="text-2xl font-mono text-green-400">
            {siteStops - missedStops.length}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Tickets Created
          </div>
        </div>
        <div className={`th-card text-center ${missedStops.length > 0 ? 'border-priority-urgent/40 bg-priority-urgent/5' : ''}`}>
          <div className={`text-2xl font-mono ${missedStops.length > 0 ? 'text-priority-urgent' : 'text-slate-100'}`}>
            {missedStops.length}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-th-text-muted">
            Missed Stops
          </div>
        </div>
      </div>

      {/* Stops timeline */}
      {loading ? (
        <div className="th-card text-center text-xs text-th-text-muted">
          Loading stops...
        </div>
      ) : stops.length === 0 ? (
        <div className="th-card text-center">
          <p className="text-sm text-th-text-secondary">
            No stopping points recorded for this day.
          </p>
          <p className="mt-1 text-xs text-th-text-muted">
            Location tracking activates automatically when TicketHub is open on a mobile device.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {stops.map((stop) => {
            const isMissed =
              stop.nearestSite &&
              !stop.ticketCreated &&
              (stop.durationMinutes ?? 0) >= 10
            const arrived = new Date(stop.arrivedAt)
            const departed = stop.departedAt
              ? new Date(stop.departedAt)
              : null

            return (
              <div
                key={stop.id}
                className={`th-card flex items-start gap-4 ${
                  isMissed
                    ? 'border-priority-urgent/40 bg-priority-urgent/5'
                    : stop.ticketCreated
                      ? 'border-green-500/30 bg-green-500/5'
                      : ''
                }`}
              >
                {/* Time column */}
                <div className="flex-none text-center">
                  <div className="font-mono text-sm text-slate-200">
                    {arrived.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  {departed && (
                    <div className="font-mono text-[10px] text-th-text-muted">
                      →{' '}
                      {departed.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                  {stop.durationMinutes != null && (
                    <div className="mt-1 font-mono text-xs text-th-text-secondary">
                      {stop.durationMinutes} min
                    </div>
                  )}
                </div>

                {/* Details column */}
                <div className="flex-1 min-w-0">
                  {stop.nearestSite ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/clients/${stop.nearestSite.client.id}`}
                          className="font-medium text-sm text-slate-200 hover:text-accent truncate"
                        >
                          {stop.nearestSite.client.shortCode ??
                            stop.nearestSite.client.name}
                        </Link>
                        <span className="text-xs text-th-text-muted">
                          {stop.distanceMeters}m away
                        </span>
                      </div>
                      <div className="text-xs text-th-text-secondary truncate">
                        {stop.nearestSite.name}
                        {stop.nearestSite.address &&
                          ` · ${stop.nearestSite.address}`}
                        {stop.nearestSite.city &&
                          `, ${stop.nearestSite.city}`}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-th-text-secondary">
                      Unknown location
                    </div>
                  )}

                  <div className="text-[10px] text-th-text-muted mt-0.5">
                    {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
                  </div>
                </div>

                {/* Status badge */}
                <div className="flex-none">
                  {stop.ticketCreated ? (
                    <Link
                      href={`/tickets/${stop.ticketId}`}
                      className="inline-block rounded bg-green-500/20 px-2 py-1 text-[10px] font-mono uppercase text-green-400 hover:bg-green-500/30"
                    >
                      Ticket Created
                    </Link>
                  ) : isMissed ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-block rounded bg-priority-urgent/20 px-2 py-1 text-[10px] font-mono uppercase text-priority-urgent">
                        No Ticket
                      </span>
                      {stop.nearestSite && (
                        <Link
                          href={`/tickets/new?clientId=${stop.nearestSite.client.id}`}
                          className="text-[10px] text-accent hover:underline"
                        >
                          Create now →
                        </Link>
                      )}
                    </div>
                  ) : !stop.nearestSite ? (
                    <span className="inline-block rounded bg-th-surface-raised px-2 py-1 text-[10px] font-mono uppercase text-th-text-muted">
                      No Site Match
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
