'use client'

import { useState, useTransition } from 'react'
import {
  saveTogglToken,
  testToggl,
  saveTodoistToken,
  testTodoist,
} from '@/app/lib/actions/integration-tokens'

interface Props {
  initialToggl: string
  initialTodoist: string
}

export function IntegrationTokensForm({ initialToggl, initialTodoist }: Props) {
  const [togglToken, setTogglToken] = useState(initialToggl)
  const [todoistToken, setTodoistToken] = useState(initialTodoist)
  const [togglStatus, setTogglStatus] = useState<string | null>(null)
  const [todoistStatus, setTodoistStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSaveToggl() {
    startTransition(async () => {
      const res = await saveTogglToken(togglToken)
      setTogglStatus(res.ok ? 'Saved' : res.error)
    })
  }

  function handleTestToggl() {
    startTransition(async () => {
      const res = await testToggl()
      setTogglStatus(res.ok ? (res as any).message : res.error)
    })
  }

  function handleSaveTodoist() {
    startTransition(async () => {
      const res = await saveTodoistToken(todoistToken)
      setTodoistStatus(res.ok ? 'Saved' : res.error)
    })
  }

  function handleTestTodoist() {
    startTransition(async () => {
      const res = await testTodoist()
      setTodoistStatus(res.ok ? (res as any).message : res.error)
    })
  }

  return (
    <div className="th-card p-4 max-w-2xl">
      <h2 className="font-mono text-lg text-slate-100">Per-User Integrations</h2>
      <p className="mt-1 text-sm text-th-text-secondary">
        Optional API tokens for personal time tracking and task management.
        These are per-user — each tech configures their own.
      </p>

      {/* Toggl */}
      <div className="mt-6">
        <label className="block font-mono text-xs text-th-text-muted uppercase tracking-wider">
          Toggl Track API Token
        </label>
        <p className="mt-0.5 text-xs text-th-text-secondary">
          Found at Profile → API Token on track.toggl.com. TicketHub timers will
          auto-start/stop a Toggl entry.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={togglToken}
            onChange={(e) => { setTogglToken(e.target.value); setTogglStatus(null) }}
            placeholder="Paste your Toggl API token..."
            className="th-input flex-1 text-sm"
          />
          <button
            onClick={handleSaveToggl}
            disabled={isPending}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={handleTestToggl}
            disabled={isPending || !togglToken.trim()}
            className="rounded border border-th-border px-3 py-1.5 text-xs text-slate-300 hover:bg-th-elevated disabled:opacity-50"
          >
            Test
          </button>
        </div>
        {togglStatus && (
          <p className={`mt-1 text-xs ${togglStatus.includes('Connected') || togglStatus === 'Saved' ? 'text-emerald-400' : 'text-red-400'}`}>
            {togglStatus}
          </p>
        )}
      </div>

      {/* Todoist */}
      <div className="mt-6">
        <label className="block font-mono text-xs text-th-text-muted uppercase tracking-wider">
          Todoist API Token
        </label>
        <p className="mt-0.5 text-xs text-th-text-secondary">
          Found at Settings → Integrations → Developer on todoist.com.
          Adds a &quot;Create Todoist Task&quot; button on ticket detail pages.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            type="password"
            value={todoistToken}
            onChange={(e) => { setTodoistToken(e.target.value); setTodoistStatus(null) }}
            placeholder="Paste your Todoist API token..."
            className="th-input flex-1 text-sm"
          />
          <button
            onClick={handleSaveTodoist}
            disabled={isPending}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={handleTestTodoist}
            disabled={isPending || !todoistToken.trim()}
            className="rounded border border-th-border px-3 py-1.5 text-xs text-slate-300 hover:bg-th-elevated disabled:opacity-50"
          >
            Test
          </button>
        </div>
        {todoistStatus && (
          <p className={`mt-1 text-xs ${todoistStatus.includes('Connected') || todoistStatus === 'Saved' ? 'text-emerald-400' : 'text-red-400'}`}>
            {todoistStatus}
          </p>
        )}
      </div>
    </div>
  )
}
