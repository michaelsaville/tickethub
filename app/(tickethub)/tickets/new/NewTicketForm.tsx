'use client'

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createTicket, type CreateTicketResult } from '@/app/lib/actions/tickets'

type Client = { id: string; name: string; shortCode: string | null }
type Tech = { id: string; name: string }

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

export function NewTicketForm({
  clients,
  techs,
  initialClientId,
}: {
  clients: Client[]
  techs: Tech[]
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <form action={formAction} className="th-card space-y-4">
        <input type="hidden" name="contractId" value={contractId} />
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
        </div>

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
