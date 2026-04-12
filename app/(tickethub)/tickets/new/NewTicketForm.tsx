'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createTicket, type CreateTicketResult } from '@/app/lib/actions/tickets'

type Client = { id: string; name: string; shortCode: string | null }
type Tech = { id: string; name: string }
type SiteWithCoords = {
  id: string
  name: string
  clientId: string
  latitude: number
  longitude: number
}

interface ClientContext {
  internalNotes: string | null
  openTickets: Array<{
    id: string
    ticketNumber: number
    title: string
    status: string
    priority: string
  }>
  contracts: Array<{
    id: string
    name: string
    type: string
    status: string
    isGlobal: boolean
  }>
}

interface AiSuggestion {
  priority: string
  type: string
  category: string
  suggestedAssigneeName: string | null
  reasoning: string
}

export function NewTicketForm({
  clients,
  techs,
  sites,
  initialClientId,
}: {
  clients: Client[]
  techs: Tech[]
  sites: SiteWithCoords[]
  initialClientId: string
}) {
  const [state, formAction] = useFormState<CreateTicketResult | null, FormData>(
    createTicket,
    null,
  )
  const [clientId, setClientId] = useState(initialClientId)
  const [contractId, setContractId] = useState<string>('')
  const [context, setContext] = useState<ClientContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDismissed, setAiDismissed] = useState(false)
  const [locationMatch, setLocationMatch] = useState<{
    site: SiteWithCoords
    client: Client
    distanceMeters: number
  } | null>(null)
  const [locationDismissed, setLocationDismissed] = useState(false)
  const priorityRef = useRef<HTMLSelectElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)
  const assigneeRef = useRef<HTMLSelectElement>(null)

  // Auto-detect location on mobile — find nearest client site
  useEffect(() => {
    if (initialClientId || !navigator.geolocation || sites.length === 0) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const toRad = (d: number) => (d * Math.PI) / 180
        let closest: SiteWithCoords | null = null
        let closestDist = Infinity
        for (const site of sites) {
          const R = 6_371_000
          const dLat = toRad(site.latitude - latitude)
          const dLng = toRad(site.longitude - longitude)
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(latitude)) *
              Math.cos(toRad(site.latitude)) *
              Math.sin(dLng / 2) ** 2
          const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
          if (d < closestDist) {
            closest = site
            closestDist = d
          }
        }
        if (closest && closestDist <= 200) {
          const matchedClient = clients.find((c) => c.id === closest!.clientId)
          if (matchedClient) {
            setLocationMatch({
              site: closest,
              client: matchedClient,
              distanceMeters: Math.round(closestDist),
            })
          }
        }
      },
      () => {}, // Silently fail — GPS is best-effort
      { timeout: 5000, enableHighAccuracy: true },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clientId) {
      setContext(null)
      return
    }
    setLoadingContext(true)
    const ac = new AbortController()
    fetch(`/api/clients/${clientId}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) return
        const data = res.data
        const contracts = (data.contracts ?? []) as ClientContext['contracts']
        setContext({
          internalNotes: data.internalNotes ?? null,
          openTickets: (data.tickets ?? []).map(
            (t: {
              id: string
              ticketNumber: number
              title: string
              status: string
              priority: string
            }) => t,
          ),
          contracts,
        })
        // Default to the Global Contract when switching clients
        const global = contracts.find((c) => c.isGlobal)
        setContractId(global?.id ?? '')
      })
      .catch((e) => {
        if (e.name !== 'AbortError') console.error(e)
      })
      .finally(() => setLoadingContext(false))
    return () => ac.abort()
  }, [clientId])

  async function handleClassify() {
    const titleEl = document.getElementById('title') as HTMLInputElement | null
    const descEl = document.getElementById('description') as HTMLTextAreaElement | null
    const title = titleEl?.value?.trim()
    if (!title) return
    setAiLoading(true)
    setAiDismissed(false)
    setAiSuggestion(null)
    try {
      const res = await fetch('/api/ai/classify-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: descEl?.value?.trim() || '',
          clientId: clientId || undefined,
        }),
      })
      const json = await res.json()
      if (json.data) setAiSuggestion(json.data as AiSuggestion)
    } catch {
      // Silently fail — AI is a nice-to-have
    } finally {
      setAiLoading(false)
    }
  }

  function applyAiSuggestion() {
    if (!aiSuggestion) return
    if (priorityRef.current) {
      priorityRef.current.value = aiSuggestion.priority
      priorityRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (typeRef.current) {
      typeRef.current.value = aiSuggestion.type
      typeRef.current.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (aiSuggestion.suggestedAssigneeName && assigneeRef.current) {
      const match = techs.find(
        (t) =>
          t.name.toLowerCase() ===
          aiSuggestion.suggestedAssigneeName!.toLowerCase(),
      )
      if (match) {
        assigneeRef.current.value = match.id
        assigneeRef.current.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
    setAiDismissed(true)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <form action={formAction} className="th-card space-y-4">
        <input type="hidden" name="contractId" value={contractId} />

        {/* GPS location match banner */}
        {locationMatch && !locationDismissed && !clientId && (
          <div className="rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-green-400">
                Location Detected
              </span>
              <button
                type="button"
                onClick={() => setLocationDismissed(true)}
                className="text-xs text-th-text-muted hover:text-th-text-secondary"
              >
                Dismiss
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-200">
              You appear to be at <strong>{locationMatch.site.name}</strong> ({locationMatch.client.name}) — {locationMatch.distanceMeters}m away
            </p>
            <button
              type="button"
              onClick={() => {
                setClientId(locationMatch.client.id)
                setLocationDismissed(true)
              }}
              className="mt-2 rounded bg-green-500/20 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/30 transition-colors"
            >
              Use This Client
            </button>
          </div>
        )}

        <div>
          <label
            htmlFor="clientId"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
          >
            Client *
          </label>
          <select
            id="clientId"
            name="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className="th-input"
          >
            <option value="" disabled>
              Select a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.shortCode ? ` (${c.shortCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        {context && context.contracts.length > 1 && (
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Contract
            </label>
            <select
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
              className="th-input"
            >
              {context.contracts
                .filter((c) => c.status === 'ACTIVE' || c.isGlobal)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.type}
                    {c.isGlobal ? ' (default)' : ''}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-th-text-muted">
              Block-hours and recurring contracts only track usage for
              tickets attached to them.
            </p>
          </div>
        )}

        <div>
          <label
            htmlFor="title"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
          >
            Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            className="th-input"
            placeholder="Brief summary of the issue"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={8}
            className="th-input resize-y"
            placeholder="What's going on? Include error messages, steps taken, client-reported details."
          />
          <button
            type="button"
            onClick={handleClassify}
            disabled={aiLoading}
            className="mt-2 inline-flex items-center gap-1.5 rounded bg-th-surface-raised px-3 py-1.5 text-xs font-medium text-th-text-secondary hover:bg-th-surface-raised/80 hover:text-accent transition-colors disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Classifying...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Classify with AI
              </>
            )}
          </button>
        </div>

        {/* AI Classification */}
        {aiSuggestion && !aiDismissed && (
          <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                AI Suggestion
              </span>
              <button
                type="button"
                onClick={() => setAiDismissed(true)}
                className="text-xs text-th-text-muted hover:text-th-text-secondary"
              >
                Dismiss
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-th-surface-raised px-2 py-0.5">
                Priority: <strong>{aiSuggestion.priority}</strong>
              </span>
              <span className="rounded bg-th-surface-raised px-2 py-0.5">
                Type: <strong>{aiSuggestion.type.replace(/_/g, ' ')}</strong>
              </span>
              <span className="rounded bg-th-surface-raised px-2 py-0.5">
                Category: <strong>{aiSuggestion.category}</strong>
              </span>
              {aiSuggestion.suggestedAssigneeName && (
                <span className="rounded bg-th-surface-raised px-2 py-0.5">
                  Assignee: <strong>{aiSuggestion.suggestedAssigneeName}</strong>
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-th-text-muted italic">
              {aiSuggestion.reasoning}
            </p>
            <button
              type="button"
              onClick={applyAiSuggestion}
              className="mt-2 rounded bg-accent/20 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
            >
              Apply Suggestions
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="priority"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
            >
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              ref={priorityRef}
              defaultValue="MEDIUM"
              className="th-input"
            >
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="type"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
            >
              Type
            </label>
            <select
              id="type"
              name="type"
              ref={typeRef}
              defaultValue="INCIDENT"
              className="th-input"
            >
              <option value="INCIDENT">Incident</option>
              <option value="SERVICE_REQUEST">Service Request</option>
              <option value="PROBLEM">Problem</option>
              <option value="CHANGE">Change</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INTERNAL">Internal</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="assignedToId"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted"
            >
              Assignee
            </label>
            <select
              id="assignedToId"
              name="assignedToId"
              ref={assigneeRef}
              defaultValue=""
              className="th-input"
            >
              <option value="">Unassigned</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {state && !state.ok && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
            {state.error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <SubmitButton />
          <a href="/tickets" className="th-btn-ghost">
            Cancel
          </a>
        </div>
      </form>

      <aside className="space-y-4">
        <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Client Context
        </h2>
        {!clientId ? (
          <div className="th-card text-xs text-th-text-secondary">
            Select a client to see their internal notes and open tickets.
          </div>
        ) : loadingContext ? (
          <div className="th-card text-xs text-th-text-muted">Loading…</div>
        ) : context ? (
          <>
            {context.internalNotes ? (
              <div className="th-card border-accent/40 bg-accent/5">
                <div className="font-mono text-[10px] uppercase tracking-wider text-accent">
                  Internal Notes
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-200">
                  {context.internalNotes}
                </p>
              </div>
            ) : null}
            <div className="th-card">
              <div className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Open Tickets ({context.openTickets.length})
              </div>
              {context.openTickets.length === 0 ? (
                <p className="mt-2 text-xs text-th-text-muted">
                  No other open tickets.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs">
                  {context.openTickets.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <a
                        href={`/tickets/${t.id}`}
                        className="text-slate-300 hover:text-accent"
                      >
                        <span className="font-mono text-th-text-muted">
                          #{t.ticketNumber}
                        </span>{' '}
                        {t.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="th-card text-xs text-th-text-muted">
            Could not load client context.
          </div>
        )}
      </aside>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Creating…' : 'Create Ticket'}
    </button>
  )
}
