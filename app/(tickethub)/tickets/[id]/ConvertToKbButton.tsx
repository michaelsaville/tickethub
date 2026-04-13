'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { convertTicketToKb } from '@/app/lib/actions/kb'

interface Props {
  ticketId: string
  ticketStatus: string
}

export function ConvertToKbButton({ ticketId, ticketStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  // Only show on resolved/closed tickets
  const eligible = ['RESOLVED', 'CLOSED'].includes(ticketStatus)
  if (!eligible) return null

  function handleClick() {
    startTransition(async () => {
      const res = await convertTicketToKb(ticketId)
      if (res.ok) {
        setResult('KB article created')
        if (res.id) {
          setTimeout(() => router.push(`/kb/${res.id}`), 800)
        }
      } else {
        setResult(res.error)
      }
    })
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded border border-th-border bg-th-elevated px-3 py-1.5 text-xs text-slate-300 hover:bg-th-border disabled:opacity-50"
      >
        {isPending ? 'Converting...' : 'Convert to KB Article'}
      </button>
      {result && (
        <p className={`mt-1 text-[10px] ${result.includes('created') ? 'text-emerald-400' : 'text-red-400'}`}>
          {result}
        </p>
      )}
    </div>
  )
}
