'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createInvoiceForClient } from '@/app/lib/actions/invoices'

export function CreateDraftButton({
  clientId,
  blocked,
  blockedReason,
}: {
  clientId: string
  blocked: boolean
  blockedReason: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function go() {
    if (blocked) return
    setErr(null)
    startTransition(async () => {
      const res = await createInvoiceForClient(clientId)
      if (!res.ok) {
        setErr(res.error)
        return
      }
      router.push(`/invoices/${res.invoiceId}`)
    })
  }

  if (blocked) {
    return (
      <span
        title={blockedReason ?? 'Blocked'}
        className="rounded-md border border-th-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-th-text-muted"
      >
        Blocked
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={isPending}
        className="th-btn-primary text-xs"
        title="Create a DRAFT invoice with all of this client's BILLABLE charges"
      >
        {isPending ? 'Drafting…' : 'Create draft'}
      </button>
      {err && (
        <span className="text-[10px] text-priority-urgent">{err}</span>
      )}
    </div>
  )
}
