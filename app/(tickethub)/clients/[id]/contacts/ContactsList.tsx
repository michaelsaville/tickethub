'use client'

import { useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  createContact,
  deleteContact,
  type ContactResult,
} from '@/app/lib/actions/contacts'

type Contact = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  isPrimary: boolean
}

export function ContactsList({
  clientId,
  contacts,
}: {
  clientId: string
  contacts: Contact[]
}) {
  const [showForm, setShowForm] = useState(contacts.length === 0)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      <div>
        {contacts.length === 0 ? (
          <div className="th-card text-center text-sm text-th-text-secondary">
            No contacts yet. Add the first one →
          </div>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <ContactRow key={c.id} clientId={clientId} contact={c} />
            ))}
          </ul>
        )}
      </div>
      <aside>
        {showForm ? (
          <AddContactForm
            clientId={clientId}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="th-btn-primary w-full"
          >
            + Add Contact
          </button>
        )}
      </aside>
    </div>
  )
}

function ContactRow({
  clientId,
  contact,
}: {
  clientId: string
  contact: Contact
}) {
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function remove() {
    if (!confirm(`Remove ${contact.firstName} ${contact.lastName}?`)) return
    setErr(null)
    startTransition(async () => {
      const res = await deleteContact(clientId, contact.id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <li className="th-card flex items-start justify-between gap-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-slate-100">
            {contact.firstName} {contact.lastName}
          </span>
          {contact.isPrimary && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Primary
            </span>
          )}
        </div>
        {contact.jobTitle && (
          <div className="mt-0.5 text-xs text-th-text-secondary">
            {contact.jobTitle}
          </div>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="mt-1 block text-xs text-th-text-muted hover:text-accent"
          >
            {contact.email}
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="text-xs text-th-text-muted hover:text-accent"
          >
            {contact.phone}
          </a>
        )}
        {err && (
          <div className="mt-2 text-xs text-priority-urgent">{err}</div>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={isPending}
        className="th-btn-ghost text-xs text-th-text-muted hover:text-priority-urgent"
      >
        Remove
      </button>
    </li>
  )
}

function AddContactForm({
  clientId,
  onCancel,
}: {
  clientId: string
  onCancel: () => void
}) {
  const boundAction = createContact.bind(null, clientId)
  const [state, formAction] = useFormState<ContactResult | null, FormData>(
    boundAction,
    null,
  )
  return (
    <form action={formAction} className="th-card space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-accent">
        New Contact
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <input
          name="firstName"
          required
          placeholder="First name"
          className="th-input"
          autoFocus
        />
        <input
          name="lastName"
          required
          placeholder="Last name"
          className="th-input"
        />
      </div>
      <input
        name="jobTitle"
        placeholder="Job title (optional)"
        className="th-input"
      />
      <input
        name="email"
        type="email"
        placeholder="Email"
        className="th-input"
      />
      <input name="phone" type="tel" placeholder="Phone" className="th-input" />
      <label className="flex items-center gap-2 text-xs text-th-text-secondary">
        <input
          type="checkbox"
          name="isPrimary"
          className="h-4 w-4 rounded border-th-border bg-th-base text-accent focus:ring-accent"
        />
        Primary contact
      </label>
      {state && !state.ok && (
        <div className="rounded-md border border-priority-urgent/40 bg-priority-urgent/10 px-2 py-1 text-xs text-priority-urgent">
          {state.error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <AddButton />
        <button type="button" onClick={onCancel} className="th-btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="th-btn-primary">
      {pending ? 'Adding…' : 'Add Contact'}
    </button>
  )
}
