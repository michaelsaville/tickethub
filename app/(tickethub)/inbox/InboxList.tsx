'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  blockSender,
  bulkDismissPending,
  createTicketFromPending,
  dismissPending,
} from '@/app/lib/actions/inbox'

export interface InboxRow {
  id: string
  fromEmail: string
  fromName: string | null
  subject: string
  snippet: string
  bodyText: string
  receivedAt: string
  additionalCount: number
  forwardedBy: string | null
  forwardedByUserId: string | null
  status: string
  matchedTicketId: string | null
  mailbox: string | null
}

interface Props {
  rows: InboxRow[]
  clients: Array<{ id: string; name: string; shortCode: string | null }>
  techs: Array<{ id: string; name: string }>
  currentUserId: string
}

export function InboxList({ rows, clients, techs, currentUserId }: Props) {
  const [openRow, setOpenRow] = useState<InboxRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkErr, setBulkErr] = useState<string | null>(null)
  const [bulkPending, startBulk] = useTransition()
  const router = useRouter()

  const pendingRows = rows.filter((r) => r.status === 'PENDING')
  const selectablePendingIds = new Set(pendingRows.map((r) => r.id))
  const selectedPendingCount = [...selected].filter((id) =>
    selectablePendingIds.has(id),
  ).length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllPending() {
    setSelected(new Set(pendingRows.map((r) => r.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  function bulkDismiss() {
    const ids = [...selected].filter((id) => selectablePendingIds.has(id))
    if (ids.length === 0) return
    if (
      !confirm(
        `Dismiss ${ids.length} email${ids.length === 1 ? '' : 's'}? You can't undo this.`,
      )
    )
      return
    setBulkErr(null)
    startBulk(async () => {
      const res = await bulkDismissPending(ids)
      if (!res.ok) setBulkErr(res.error ?? 'Failed')
      else {
        clearSelection()
        router.refresh()
      }
    })
  }

  if (rows.length === 0) {
    return (
      <div className="th-card text-center text-xs text-th-text-muted">
        Nothing here. Inbound emails will appear when they arrive.
      </div>
    )
  }

  return (
    <>
      {selectedPendingCount > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-th-elevated px-3 py-2 shadow">
          <span className="text-sm text-slate-200">
            {selectedPendingCount} selected
          </span>
          <button
            type="button"
            onClick={bulkDismiss}
            disabled={bulkPending}
            className="th-btn-primary text-xs"
          >
            {bulkPending ? 'Dismissing…' : `Dismiss ${selectedPendingCount}`}
          </button>
          <button
            type="button"
            onClick={selectAllPending}
            className="th-btn-ghost text-xs"
          >
            Select all pending ({pendingRows.length})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="th-btn-ghost text-xs"
          >
            Clear
          </button>
          {bulkErr && (
            <span className="text-xs text-priority-urgent">{bulkErr}</span>
          )}
        </div>
      )}
      <div className="space-y-2">
        {rows.map((row) => (
          <InboxRowCard
            key={row.id}
            row={row}
            onCreate={() => setOpenRow(row)}
            selected={selected.has(row.id)}
            onSelectToggle={
              row.status === 'PENDING' ? () => toggle(row.id) : null
            }
          />
        ))}
      </div>
      {openRow && (
        <CreateFromPendingDialog
          row={openRow}
          clients={clients}
          techs={techs}
          currentUserId={currentUserId}
          onClose={() => setOpenRow(null)}
        />
      )}
    </>
  )
}

function InboxRowCard({
  row,
  onCreate,
  selected,
  onSelectToggle,
}: {
  row: InboxRow
  onCreate: () => void
  selected: boolean
  onSelectToggle: (() => void) | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function dismiss() {
    if (!confirm('Dismiss this email?')) return
    setErr(null)
    startTransition(async () => {
      const res = await dismissPending(row.id)
      if (!res.ok) setErr(res.error ?? 'Failed')
      else router.refresh()
    })
  }

  function block(scope: 'EMAIL' | 'DOMAIN') {
    const label =
      scope === 'EMAIL'
        ? row.fromEmail
        : row.fromEmail.split('@')[1] ?? row.fromEmail
    if (!confirm(`Block future emails from ${label}?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await blockSender(row.id, scope)
      if (!res.ok) setErr(res.error ?? 'Failed')
      else router.refresh()
    })
  }

  const isForwarded = Boolean(row.forwardedBy)
  const isDismissed = row.status === 'DISMISSED'
  const isApproved = row.status === 'APPROVED'
  const mailboxLabel = row.mailbox
    ? row.mailbox.split('@')[0] ?? row.mailbox
    : null

  return (
    <div
      className={
        selected ? 'th-card border-accent/60 bg-accent/5' : 'th-card'
      }
    >
      <div className="flex items-start justify-between gap-4">
        {onSelectToggle && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectToggle}
            aria-label="Select email"
            className="mt-1.5 h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {mailboxLabel && (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-sky-300">
                {mailboxLabel}
              </span>
            )}
            {isForwarded && (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                ↪ {row.forwardedBy}
              </span>
            )}
            {isDismissed && (
              <span className="rounded-full border border-th-border bg-th-base px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                dismissed
              </span>
            )}
            {isApproved && row.matchedTicketId && (
              <Link
                href={`/tickets/${row.matchedTicketId}`}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300"
              >
                → ticket
              </Link>
            )}
            <span className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              {new Date(row.receivedAt).toLocaleString()}
            </span>
            {row.additionalCount > 0 && (
              <span className="font-mono text-[10px] text-amber-300">
                +{row.additionalCount} more
              </span>
            )}
          </div>
          <div className="truncate text-sm text-slate-100">
            <span className="font-mono text-th-text-muted">
              {row.fromName ?? row.fromEmail}
            </span>{' '}
            — {row.subject}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-th-text-secondary">
            {row.snippet}
          </div>
        </div>
        {!isDismissed && !isApproved && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onCreate}
              disabled={isPending}
              className="th-btn-primary text-xs whitespace-nowrap"
            >
              Create Ticket
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-slate-200"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => block('EMAIL')}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
              title={`Block ${row.fromEmail}`}
            >
              Block sender
            </button>
            <button
              type="button"
              onClick={() => block('DOMAIN')}
              disabled={isPending}
              className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
              title={`Block @${row.fromEmail.split('@')[1] ?? ''}`}
            >
              Block domain
            </button>
          </div>
        )}
      </div>
      {err && (
        <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-2 py-1 text-xs text-priority-urgent">
          {err}
        </div>
      )}
    </div>
  )
}

function CreateFromPendingDialog({
  row,
  clients,
  techs,
  currentUserId,
  onClose,
}: {
  row: InboxRow
  clients: Array<{ id: string; name: string; shortCode: string | null }>
  techs: Array<{ id: string; name: string }>
  currentUserId: string
  onClose: () => void
}) {
  const router = useRouter()
  // Default-suggest client by email domain (very rough match)
  const senderDomain = row.fromEmail.split('@')[1]?.toLowerCase() ?? ''
  const suggestion =
    clients.find((c) =>
      c.name.toLowerCase().includes(senderDomain.split('.')[0] ?? ''),
    ) ?? null

  // For forwarded emails, the "From" is the tech, not the client — the
  // add-contact checkbox is unchecked by default and assignee defaults
  // to the forwarding tech.
  const isForwarded = Boolean(row.forwardedBy)

  const parsedName = (row.fromName ?? '').trim().split(/\s+/)
  const defaultFirstName = isForwarded ? '' : parsedName[0] ?? ''
  const defaultLastName = isForwarded
    ? ''
    : parsedName.slice(1).join(' ') ?? ''

  const [clientId, setClientId] = useState(suggestion?.id ?? '')
  const [title, setTitle] = useState(row.subject)
  const [description, setDescription] = useState(
    `From: ${row.fromName ?? row.fromEmail} <${row.fromEmail}>\n\n${row.bodyText}`,
  )
  const [priority, setPriority] = useState<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>(
    'MEDIUM',
  )
  const [assignedToId, setAssignedToId] = useState<string>(
    row.forwardedByUserId ?? currentUserId ?? '',
  )
  const [addContact, setAddContact] = useState<boolean>(!isForwarded)
  const [firstName, setFirstName] = useState(defaultFirstName)
  const [lastName, setLastName] = useState(defaultLastName)
  const [err, setErr] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!clientId) {
      setErr('Pick a client')
      return
    }
    setErr(null)
    startTransition(async () => {
      const res = await createTicketFromPending({
        pendingId: row.id,
        clientId,
        title,
        description,
        priority,
        assignedToId: assignedToId || null,
        addContact,
        contactFirstName: firstName,
        contactLastName: lastName,
      })
      if (!res.ok) {
        setErr(res.error ?? 'Failed')
        return
      }
      onClose()
      if (res.ticketId) router.push(`/tickets/${res.ticketId}`)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="th-card my-8 w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-mono text-sm uppercase tracking-widest text-accent">
          Create Ticket from Email
        </h2>
        <p className="mb-4 text-[11px] text-th-text-muted">
          From <span className="font-mono">{row.fromEmail}</span> ·{' '}
          {new Date(row.receivedAt).toLocaleString()}
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Client
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="th-input"
            >
              <option value="">— pick a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortCode ? `${c.shortCode} · ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="th-input"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="th-input resize-y font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW',
                  )
                }
                className="th-input"
              >
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
                Assignee
              </label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
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

          <div className="rounded-md border border-th-border bg-th-base p-3">
            <label className="flex items-center gap-2 text-xs text-th-text-secondary">
              <input
                type="checkbox"
                checked={addContact}
                onChange={(e) => setAddContact(e.target.checked)}
              />
              Also add{' '}
              <span className="font-mono text-slate-200">{row.fromEmail}</span>{' '}
              as a contact on this client
            </label>
            {addContact && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="th-input"
                />
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="th-input"
                />
              </div>
            )}
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            {err}
          </div>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="th-btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !clientId}
            className="th-btn-primary"
          >
            {isPending ? 'Creating…' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
