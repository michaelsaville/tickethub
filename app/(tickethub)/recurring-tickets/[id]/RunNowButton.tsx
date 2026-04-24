'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { runRecurringTemplateNow } from '@/app/lib/actions/recurring-tickets'

export function RunNowButton({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runRecurringTemplateNow(templateId)
          if (result.ok && result.id) {
            router.push(`/tickets/${result.id}`)
          } else if (!result.ok) {
            alert(result.error)
          }
          router.refresh()
        })
      }
      className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
    >
      {pending ? 'Spawning…' : 'Run now'}
    </button>
  )
}
