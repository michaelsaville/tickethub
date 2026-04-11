'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  sendTestNotification,
  updateNotificationPrefs,
  type PrefsResult,
} from '@/app/lib/actions/notification-prefs'

const MODES = [
  {
    value: 'ON_CALL',
    label: 'On Call',
    description: 'Every notification in real time.',
  },
  {
    value: 'WORKING',
    label: 'Working',
    description: 'Assigned tickets, SLA warnings, direct comments.',
  },
  {
    value: 'OFF_DUTY',
    label: 'Off Duty',
    description: 'Critical P1 + SLA breaches only, Pushover.',
  },
] as const

export function NotificationPrefsForm({
  initial,
  defaultTopic,
  ntfyBaseUrl,
  pushoverConfigured,
}: {
  initial: {
    mode: string
    ntfyTopic: string | null
    pushoverToken: string | null
  }
  defaultTopic: string
  ntfyBaseUrl: string
  pushoverConfigured: boolean
}) {
  const [state, formAction] = useFormState<PrefsResult | null, FormData>(
    updateNotificationPrefs,
    null,
  )
  const [topic, setTopic] = useState(initial.ntfyTopic ?? '')
  const [testErr, setTestErr] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  const effectiveTopic = (topic || defaultTopic).trim()
  const ntfyShareUrl = ntfyBaseUrl
    ? `${ntfyBaseUrl.replace(/\/$/, '')}/${effectiveTopic}`
    : null

  function runTest() {
    setTestErr(null)
    setTestOk(false)
    startTransition(async () => {
      const res = await sendTestNotification()
      if (!res.ok) setTestErr(res.error)
      else setTestOk(true)
    })
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="th-card">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Mode
        </div>
        <div className="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex items-start gap-3 rounded-md border border-th-border bg-th-base p-3 cursor-pointer hover:bg-th-elevated"
            >
              <input
                type="radio"
                name="mode"
                value={m.value}
                defaultChecked={initial.mode === m.value}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-100">{m.label}</div>
                <div className="text-xs text-th-text-secondary">
                  {m.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="th-card">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          ntfy — Self-hosted Push
        </div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Topic
        </label>
        <input
          name="ntfyTopic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={defaultTopic}
          className="th-input font-mono"
        />
        <p className="mt-1 text-xs text-th-text-muted">
          Leave blank to use the default <span className="font-mono">{defaultTopic}</span>.
          Subscribe to this topic in the ntfy mobile app.
        </p>
        {ntfyShareUrl && (
          <p className="mt-2 text-xs">
            <span className="text-th-text-muted">Subscribe URL: </span>
            <a
              href={ntfyShareUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {ntfyShareUrl}
            </a>
          </p>
        )}
        {!ntfyBaseUrl && (
          <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            NTFY_URL is not configured on the server — ntfy push is disabled
            until an admin sets it.
          </div>
        )}
      </section>

      <section className="th-card">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Pushover — Critical Alerts
        </div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          User Key
        </label>
        <input
          name="pushoverToken"
          defaultValue={initial.pushoverToken ?? ''}
          placeholder="u1234…"
          className="th-input font-mono"
          type="text"
        />
        <p className="mt-1 text-xs text-th-text-muted">
          Your personal Pushover user key (not the app token). Get it from
          the Pushover app → Settings → Your User Key. Only critical
          priority alerts use Pushover; routine alerts use ntfy.
        </p>
        {!pushoverConfigured && (
          <div className="mt-2 rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-1.5 text-xs text-priority-urgent">
            PUSHOVER_APP_TOKEN is not configured on the server — Pushover is
            disabled until an admin sets it.
          </div>
        )}
      </section>

      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md border border-status-resolved/40 bg-status-resolved/10 px-3 py-2 text-sm text-status-resolved">
          Saved.
        </div>
      )}

      <div className="flex items-center gap-3">
        <SaveButton />
        <button
          type="button"
          onClick={runTest}
          disabled={isPending}
          className="th-btn-secondary text-sm"
        >
          {isPending ? 'Sending…' : 'Send Test'}
        </button>
        {testOk && (
          <span className="text-xs text-status-resolved">
            Test sent — check your subscribed ntfy topic.
          </span>
        )}
        {testErr && <span className="text-xs text-priority-urgent">{testErr}</span>}
      </div>
    </form>
  )
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Saving…' : 'Save Preferences'}
    </button>
  )
}
