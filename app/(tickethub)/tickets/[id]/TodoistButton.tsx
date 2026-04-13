'use client'

import { useState, useTransition } from 'react'
import { createTodoistTaskFromTicket } from '@/app/lib/actions/todoist'

interface Props {
  ticketId: string
}

export function TodoistButton({ ticketId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function handleClick() {
    startTransition(async () => {
      const res = await createTodoistTaskFromTicket(ticketId)
      if (res.ok) {
        setResult('Task created in Todoist')
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
        {isPending ? 'Creating...' : 'Create Todoist Task'}
      </button>
      {result && (
        <p className={`mt-1 text-[10px] ${result.includes('created') ? 'text-emerald-400' : 'text-red-400'}`}>
          {result}
        </p>
      )}
    </div>
  )
}
