'use client'

import { useState, useTransition } from 'react'
import { pageOnCall } from '@/app/lib/actions/page-on-call'

export function PageOnCallButton({
  ticketId,
  ticketNumber,
  ticketTitle,
}: {
  ticketId: string
  ticketNumber: number
  ticketTitle: string
}) {
  const [pending, startTransition] = useTransition()
  const [flash, setFlash] = useState<string | null>(null)

  function onPage() {
    if (
      !confirm(
        `Page whoever is on call about ticket #TH-${ticketNumber}? They'll get a high-priority push.`,
      )
    ) {
      return
    }
    setFlash(null)
    startTransition(async () => {
      const r = await pageOnCall({ ticketId, ticketNumber, ticketTitle })
      if (r.ok) {
        setFlash(
          r.deliveredTo === 'on_call'
            ? `Paged ${r.userName ?? 'on-call'}.`
            : 'Nobody on call — fell back to team topic.',
        )
      } else {
        setFlash(`Failed: ${r.error}`)
      }
    })
  }

  return (
    <div className="th-card">
      <button
        onClick={onPage}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded text-sm font-medium text-amber-300 hover:text-amber-200 disabled:opacity-50"
      >
        {pending ? 'Paging…' : '📟 Page on-call'}
      </button>
      {flash && (
        <p className="mt-2 text-center text-xs text-th-text-secondary">
          {flash}
        </p>
      )}
    </div>
  )
}
