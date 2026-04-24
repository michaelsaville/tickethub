'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  RecurringResult,
} from '@/app/lib/actions/recurring-tickets'
import {
  computeNextRunAt,
  type ScheduleInput,
  VALID_TIMEZONES_FALLBACK,
} from '@/app/lib/recurring-tickets'

export interface TemplateFormClientOption {
  id: string
  name: string
  shortCode: string | null
  sites: { id: string; name: string }[]
  contacts: {
    id: string
    firstName: string
    lastName: string
    isPrimary: boolean
  }[]
  contracts: { id: string; name: string }[]
}

export interface TemplateFormTechOption {
  id: string
  name: string
}

export interface TemplateFormInitial {
  name: string
  clientId: string
  siteId: string | null
  contactId: string | null
  contractId: string | null
  assignedToId: string | null
  title: string
  description: string | null
  priority: string
  type: string
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  dayOfWeek: number | null
  dayOfMonth: number | null
  hourOfDay: number
  minuteOfHour: number
  timezone: string
  active: boolean
}

const DEFAULT_INITIAL: TemplateFormInitial = {
  name: '',
  clientId: '',
  siteId: null,
  contactId: null,
  contractId: null,
  assignedToId: null,
  title: '',
  description: '',
  priority: 'MEDIUM',
  type: 'SERVICE_REQUEST',
  frequency: 'WEEKLY',
  interval: 1,
  dayOfWeek: 1, // Monday
  dayOfMonth: 1,
  hourOfDay: 8,
  minuteOfHour: 0,
  timezone: 'America/New_York',
  active: true,
}

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
] as const

interface Props {
  clients: TemplateFormClientOption[]
  techs: TemplateFormTechOption[]
  action: (
    prev: RecurringResult | null,
    fd: FormData,
  ) => Promise<RecurringResult>
  initial?: TemplateFormInitial
  /** "Save & continue" target — list URL if creating, detail URL if editing. */
  successHref: string
  submitLabel: string
}

export function TemplateForm({
  clients,
  techs,
  action,
  initial = DEFAULT_INITIAL,
  successHref,
  submitLabel,
}: Props) {
  const router = useRouter()
  const [state, formAction] = useFormState<RecurringResult | null, FormData>(
    action,
    null,
  )
  const [clientId, setClientId] = useState(initial.clientId)
  const [siteId, setSiteId] = useState(initial.siteId ?? '')
  const [contactId, setContactId] = useState(initial.contactId ?? '')
  const [contractId, setContractId] = useState(initial.contractId ?? '')
  const [frequency, setFrequency] = useState(initial.frequency)
  const [interval, setIntervalState] = useState(initial.interval)
  const [dayOfWeek, setDayOfWeek] = useState(initial.dayOfWeek ?? 1)
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth ?? 1)
  const [hourOfDay, setHourOfDay] = useState(initial.hourOfDay)
  const [minuteOfHour, setMinuteOfHour] = useState(initial.minuteOfHour)
  const [timezone, setTimezone] = useState(initial.timezone)

  const navigated = useRef(false)
  useEffect(() => {
    if (state?.ok && !navigated.current) {
      navigated.current = true
      router.push(successHref)
      router.refresh()
    }
  }, [state, router, successHref])

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  )

  // Reset child pickers when client changes
  useEffect(() => {
    if (!selectedClient) return
    if (siteId && !selectedClient.sites.some((s) => s.id === siteId)) {
      setSiteId('')
    }
    if (contactId && !selectedClient.contacts.some((c) => c.id === contactId)) {
      setContactId('')
    }
    if (contractId && !selectedClient.contracts.some((c) => c.id === contractId)) {
      setContractId('')
    }
  }, [selectedClient, siteId, contactId, contractId])

  const previewRuns = useMemo(() => {
    const schedule: ScheduleInput = {
      frequency,
      interval: Math.max(1, interval | 0),
      dayOfWeek: frequency === 'WEEKLY' ? dayOfWeek : null,
      dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : null,
      hourOfDay,
      minuteOfHour,
      timezone,
    }
    const out: Date[] = []
    let cursor = new Date()
    try {
      for (let i = 0; i < 5; i++) {
        const next = computeNextRunAt(schedule, cursor)
        out.push(next)
        cursor = next
      }
    } catch {
      // invalid schedule — empty preview
    }
    return out
  }, [frequency, interval, dayOfWeek, dayOfMonth, hourOfDay, minuteOfHour, timezone])

  const intervalLabel =
    frequency === 'DAILY' ? 'day(s)'
    : frequency === 'WEEKLY' ? 'week(s)'
    : 'month(s)'

  return (
    <form action={formAction} className="space-y-6">
      {/* IDENTITY */}
      <Section title="Template">
        <Field label="Name *">
          <input
            name="name"
            defaultValue={initial.name}
            required
            placeholder="e.g. Monthly server health check — Acme"
            className={inputCls}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            name="active"
            defaultChecked={initial.active}
          />
          Active (cron will spawn tickets)
        </label>
      </Section>

      {/* TARGETING */}
      <Section title="What ticket to create">
        <Field label="Client *">
          <select
            name="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
            className={inputCls}
          >
            <option value="">— Select client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortCode ? `${c.shortCode} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </Field>

        {selectedClient && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Site (optional)">
              <select
                name="siteId"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {selectedClient.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Contact (optional)">
              <select
                name="contactId"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {selectedClient.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}{c.isPrimary ? ' (primary)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contract (optional — falls back to client's global contract)">
              <select
                name="contractId"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Auto (global contract) —</option>
                {selectedClient.contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Assigned tech (optional)">
              <select
                name="assignedToId"
                defaultValue={initial.assignedToId ?? ''}
                className={inputCls}
              >
                <option value="">— Unassigned —</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label="Ticket title *">
          <input
            name="title"
            defaultValue={initial.title}
            required
            placeholder="e.g. Monthly server health check"
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            defaultValue={initial.description ?? ''}
            rows={3}
            className={inputCls}
            placeholder="What should the tech do? Pasted into the ticket body."
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select name="priority" defaultValue={initial.priority} className={inputCls}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={initial.type} className={inputCls}>
              <option value="INCIDENT">Incident</option>
              <option value="SERVICE_REQUEST">Service Request</option>
              <option value="PROBLEM">Problem</option>
              <option value="CHANGE">Change</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* SCHEDULE */}
      <Section title="Schedule">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Frequency">
            <select
              name="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as typeof frequency)}
              className={inputCls}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field label={`Every N ${intervalLabel}`}>
            <input
              type="number"
              name="interval"
              value={interval}
              min={1}
              max={365}
              onChange={(e) => setIntervalState(Math.max(1, parseInt(e.target.value || '1', 10)))}
              className={inputCls}
            />
          </Field>
          {frequency === 'WEEKLY' && (
            <Field label="Day of week">
              <select
                name="dayOfWeek"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                className={inputCls}
              >
                {DAY_NAMES.map((n, i) => (
                  <option key={i} value={i}>{n}</option>
                ))}
              </select>
            </Field>
          )}
          {frequency === 'MONTHLY' && (
            <Field label="Day of month (clamps to last day if > month length)">
              <input
                type="number"
                name="dayOfMonth"
                value={dayOfMonth}
                min={1}
                max={31}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value || '1', 10))))}
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Hour (0–23, local time)">
            <input
              type="number"
              name="hourOfDay"
              value={hourOfDay}
              min={0}
              max={23}
              onChange={(e) => setHourOfDay(Math.max(0, Math.min(23, parseInt(e.target.value || '0', 10))))}
              className={inputCls}
            />
          </Field>
          <Field label="Minute (0–59)">
            <input
              type="number"
              name="minuteOfHour"
              value={minuteOfHour}
              min={0}
              max={59}
              onChange={(e) => setMinuteOfHour(Math.max(0, Math.min(59, parseInt(e.target.value || '0', 10))))}
              className={inputCls}
            />
          </Field>
          <Field label="Timezone">
            <select
              name="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputCls}
            >
              {VALID_TIMEZONES_FALLBACK.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>

        {previewRuns.length > 0 && (
          <div className="rounded border border-th-border bg-th-elevated p-3">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
              Next 5 occurrences
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              {previewRuns.map((d, i) => (
                <li key={i}>
                  {d.toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="ml-2 text-th-text-muted">({timezone})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {state && !state.ok && (
        <div className="rounded border border-priority-urgent/40 bg-priority-urgent/10 p-3 text-sm text-priority-urgent">
          {state.error}
        </div>
      )}

      <SubmitRow label={submitLabel} />
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-th-border bg-th-surface p-4">
      <h2 className="font-mono text-[10px] uppercase tracking-wider text-th-text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-th-text-secondary">{label}</span>
      {children}
    </label>
  )
}

function SubmitRow({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-th-bg disabled:opacity-50"
      >
        {pending ? 'Saving…' : label}
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded border border-th-border bg-th-bg px-3 py-2 text-sm text-slate-100 placeholder:text-th-text-muted focus:border-accent focus:outline-none'
