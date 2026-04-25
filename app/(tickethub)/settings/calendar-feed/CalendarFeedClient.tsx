'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  regenerateIcsToken,
  revokeIcsToken,
} from '@/app/lib/actions/calendar-feed'

const ORIGIN =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://tickethub.pcc2k.com'

export function CalendarFeedClient({
  initialUrl,
}: {
  initialUrl: string | null
}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleGenerate() {
    setErr(null)
    startTransition(async () => {
      const res = await regenerateIcsToken()
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setUrl(res.token ? `${ORIGIN}/api/cal/${res.token}` : null)
      router.refresh()
    })
  }

  function handleRevoke() {
    if (!confirm('Revoke the current calendar URL? Every device subscribed to it will stop syncing.')) return
    setErr(null)
    startTransition(async () => {
      const res = await revokeIcsToken()
      if (!res.ok) {
        setErr(res.error)
        return
      }
      setUrl(null)
      router.refresh()
    })
  }

  async function handleCopy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr('Copy failed — long-press the URL above to copy manually.')
    }
  }

  if (!url) {
    return (
      <div className="th-card max-w-2xl space-y-3">
        <p className="text-sm text-th-text-secondary">
          Calendar feed is currently <strong>disabled</strong>. Generate a
          URL to start syncing your appointments to your personal calendar.
        </p>
        {err && (
          <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
            {err}
          </div>
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="th-btn-primary"
        >
          {isPending ? 'Generating…' : 'Generate calendar URL'}
        </button>
      </div>
    )
  }

  return (
    <div className="th-card max-w-2xl space-y-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
          Your private calendar URL
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border border-th-border bg-th-base px-3 py-2">
          <code className="font-mono text-xs text-slate-200 break-all">{url}</code>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={isPending}
          className="th-btn-primary text-sm"
        >
          {copied ? 'Copied ✓' : 'Copy URL'}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="th-btn-ghost text-sm"
          title="Generates a new URL and revokes the old one"
        >
          {isPending ? 'Working…' : 'Regenerate'}
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={isPending}
          className="th-btn-ghost text-sm text-priority-urgent"
        >
          Revoke
        </button>
      </div>
      {err && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-3 py-2 text-sm text-priority-urgent">
          {err}
        </div>
      )}
    </div>
  )
}
