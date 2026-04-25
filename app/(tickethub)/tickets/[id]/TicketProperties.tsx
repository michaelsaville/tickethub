'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  TH_TicketPriority,
  TH_TicketStatus,
  TH_TicketType,
} from '@prisma/client'
import { enqueueRequest, type EnqueueInput } from '@/app/lib/sync-queue'

const STATUSES: TH_TicketStatus[] = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
]
const PRIORITIES: TH_TicketPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
const BOARDS = [
  'On-Site',
  'Remote Support',
  'In Shop',
  'Workstation For Sale',
] as const

const CLOSING_STATUSES = new Set<TH_TicketStatus>([
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
])

export function TicketProperties({
  ticketId,
  status: initialStatus,
  priority: initialPriority,
  assignedToId: initialAssignedToId,
  contractId: initialContractId,
  board: initialBoard,
  type,
  techs,
  contracts,
  timerActiveOnThisTicket = false,
}: {
  ticketId: string
  status: TH_TicketStatus
  priority: TH_TicketPriority
  assignedToId: string | null
  contractId: string | null
  board: string | null
  type: TH_TicketType
  techs: Array<{ id: string; name: string }>
  contracts: Array<{ id: string; name: string; type: string; isGlobal: boolean }>
  timerActiveOnThisTicket?: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [priority, setPriority] = useState(initialPriority)
  const [assignedToId, setAssignedToId] = useState(initialAssignedToId ?? '')
  const [contractId, setContractId] = useState(initialContractId ?? '')
  const [board, setBoard] = useState(initialBoard ?? '')
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [queuedMsg, setQueuedMsg] = useState<string | null>(null)
  const [pendingCloseStatus, setPendingCloseStatus] =
    useState<TH_TicketStatus | null>(null)

  function patch(
    input: Omit<EnqueueInput, 'method'>,
    label: string,
    rollback: () => void,
  ) {
    setErr(null)
    setQueuedMsg(null)
    startTransition(async () => {
      try {
        const res = await enqueueRequest({ ...input, method: 'PATCH' })
        if (res.synced) router.refresh()
        else setQueuedMsg(`Offline — ${label} queued.`)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed')
        rollback()
      }
    })
  }

  function changeStatus(v: TH_TicketStatus) {
    if (
      timerActiveOnThisTicket &&
      CLOSING_STATUSES.has(v) &&
      v !== status
    ) {
      // Don't optimistically update yet — keep the dropdown showing current
      // status until the user confirms or cancels the prompt.
      setPendingCloseStatus(v)
      return
    }
    applyStatusChange(v)
  }

  function applyStatusChange(v: TH_TicketStatus) {
    setStatus(v)
    patch(
      {
        type: 'UPDATE_STATUS',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/status`,
        body: { status: v },
      },
      'status change',
      () => setStatus(initialStatus),
    )
  }

  function changePriority(v: TH_TicketPriority) {
    setPriority(v)
    patch(
      {
        type: 'UPDATE_PRIORITY',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/priority`,
        body: { priority: v },
      },
      'priority change',
      () => setPriority(initialPriority),
    )
  }

  function changeAssignee(v: string) {
    setAssignedToId(v)
    patch(
      {
        type: 'UPDATE_ASSIGNEE',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/assignee`,
        body: { assignedToId: v || null },
      },
      'assignee change',
      () => setAssignedToId(initialAssignedToId ?? ''),
    )
  }

  function changeContract(v: string) {
    setContractId(v)
    patch(
      {
        type: 'UPDATE_CONTRACT',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/contract`,
        body: { contractId: v || null },
      },
      'contract change',
      () => setContractId(initialContractId ?? ''),
    )
  }

  function changeBoard(v: string) {
    setBoard(v)
    patch(
      {
        type: 'UPDATE_BOARD',
        entityType: 'TICKET',
        entityId: ticketId,
        url: `/api/tickets/${ticketId}/board`,
        body: { board: v || null },
      },
      'board change',
      () => setBoard(initialBoard ?? ''),
    )
  }

  return (
    <div className="th-card space-y-3">
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Status
        </label>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => changeStatus(e.target.value as TH_TicketStatus)}
          className="th-input"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Board
        </label>
        <select
          value={board}
          disabled={isPending}
          onChange={(e) => changeBoard(e.target.value)}
          className="th-input"
        >
          <option value="">None</option>
          {BOARDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {/* Preserve any legacy board value not in the known list */}
          {board && !BOARDS.includes(board as (typeof BOARDS)[number]) && (
            <option value={board}>{board}</option>
          )}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Priority
        </label>
        <select
          value={priority}
          disabled={isPending}
          onChange={(e) => changePriority(e.target.value as TH_TicketPriority)}
          className="th-input"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Assignee
        </label>
        <select
          value={assignedToId}
          disabled={isPending}
          onChange={(e) => changeAssignee(e.target.value)}
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

      {contracts.length > 0 && (
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
            Contract
          </label>
          <select
            value={contractId}
            disabled={isPending}
            onChange={(e) => changeContract(e.target.value)}
            className="th-input"
          >
            <option value="">None</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.type}
                {c.isGlobal ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Type
        </label>
        <div className="rounded-md border border-th-border bg-th-base px-3 py-2 text-sm text-slate-300">
          {type.replace(/_/g, ' ')}
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-2 py-1 text-xs text-priority-urgent">
          {err}
        </div>
      )}
      {queuedMsg && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
          {queuedMsg}
        </div>
      )}

      {pendingCloseStatus && (
        <TimerStillRunningModal
          targetStatus={pendingCloseStatus}
          onChangeAnyway={() => {
            const v = pendingCloseStatus
            setPendingCloseStatus(null)
            applyStatusChange(v)
          }}
          onCancel={() => setPendingCloseStatus(null)}
        />
      )}
    </div>
  )
}

function TimerStillRunningModal({
  targetStatus,
  onChangeAnyway,
  onCancel,
}: {
  targetStatus: TH_TicketStatus
  onChangeAnyway: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timer-warning-title"
    >
      <div
        className="th-card w-full max-w-md space-y-3 border-amber-500/40"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="timer-warning-title"
          className="font-mono text-[10px] uppercase tracking-wider text-amber-400"
        >
          Timer still running
        </h3>
        <p className="text-sm text-slate-200">
          You have an active timer on this ticket. Changing the status to{' '}
          <span className="font-mono text-accent">
            {targetStatus.replace(/_/g, ' ')}
          </span>{' '}
          won&apos;t stop the timer — you&apos;ll keep accruing time.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="th-btn-primary text-sm"
            autoFocus
          >
            Wait — let me stop the timer first
          </button>
          <button
            type="button"
            onClick={onChangeAnyway}
            className="th-btn-ghost text-sm"
          >
            Change anyway, leave timer running
          </button>
        </div>
      </div>
    </div>
  )
}
