'use client'

import { useState, useTransition } from 'react'
import { addTag, removeTag } from '@/app/lib/actions/tags'

interface Props {
  ticketId: string
  initial: { tag: string }[]
}

export function TagsInput({ ticketId, initial }: Props) {
  const [tags, setTags] = useState(initial.map((t) => t.tag))
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    const trimmed = input.trim().toLowerCase()
    if (!trimmed || tags.includes(trimmed)) { setInput(''); return }

    setTags((prev) => [...prev, trimmed])
    setInput('')
    startTransition(async () => {
      await addTag(ticketId, trimmed)
    })
  }

  function handleRemove(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
    startTransition(async () => {
      await removeTag(ticketId, tag)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAdd()
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      handleRemove(tags[tags.length - 1])
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300"
          >
            {tag}
            <button
              onClick={() => handleRemove(tag)}
              className="ml-0.5 text-amber-400/60 hover:text-amber-300"
              aria-label={`Remove tag ${tag}`}
            >
              x
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleAdd}
          placeholder={tags.length === 0 ? 'Add tags...' : '+'}
          className="min-w-[60px] flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 outline-none"
          disabled={isPending}
        />
      </div>
    </div>
  )
}
