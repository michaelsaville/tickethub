'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'tickethub-install-dismissed-until'

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(true) // start hidden until event fires

  useEffect(() => {
    // Re-check dismissal on mount (localStorage access is client-only)
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? '0')
    if (Date.now() < until) return

    setDismissed(false)
    const handler = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || !evt) return null

  async function install() {
    if (!evt) return
    await evt.prompt()
    const choice = await evt.userChoice
    if (choice.outcome === 'accepted') setEvt(null)
    // Either way, stop showing for a week
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    )
    setDismissed(true)
  }

  function dismiss() {
    // Snooze for a week
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    )
    setDismissed(true)
  }

  return (
    <div className="border-b border-accent/40 bg-accent/10 px-4 py-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-slate-200">
          Install TicketHub as an app for offline access + push notifications.
        </span>
        <button
          type="button"
          onClick={install}
          className="th-btn-primary text-xs"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="th-btn-ghost text-xs text-th-text-muted"
        >
          Later
        </button>
      </div>
    </div>
  )
}
