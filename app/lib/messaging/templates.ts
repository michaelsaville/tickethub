import 'server-only'
import { subjectFor, bodyFor } from '@/app/lib/ticket-email'
import { buildReminderHtml } from '@/app/lib/reminder-email'

/**
 * Catalogue of the customer-facing emails TicketHub can send. Pairs
 * each mode code (the value that shows up in TH_TicketEmailOutbound.mode)
 * with a description of when it fires, the source file it lives in,
 * and — where we have pure render helpers — a sample-data preview.
 *
 * This is NOT (yet) the authoritative template source — existing
 * senders keep their inline templates. The registry is a read-only
 * catalogue for the admin console. Future cleanup can migrate
 * senders through a sendMessage wrapper (see the portal repo for the
 * mature pattern).
 */

export interface TicketHubTemplate {
  /** Matches TH_TicketEmailOutbound.mode when the sender logs. */
  mode: string
  name: string
  description: string
  category: 'Tickets' | 'Estimates' | 'Invoices' | 'Reminders' | 'Appointments'
  /** File path where the template lives — purely informational. */
  source: string
  /** Whether the sender currently writes to TH_TicketEmailOutbound. */
  logged: boolean
  /** If present, render a preview using representative sample data. */
  preview?: { subject: string; html: string }
}

// ── Preview helpers ─────────────────────────────────────────────────

function previewTicketEmail(mode: 'NEW_TICKET' | 'STAFF_REPLY') {
  const ticketNumber = 1247
  const ticketTitle = 'Outlook keeps prompting for password after reboot'
  const subject = subjectFor(mode, ticketNumber, ticketTitle)
  const html = bodyFor({
    mode,
    clientName: 'Acme Corporation',
    contactFirstName: 'Jen',
    ticketNumber,
    ticketTitle,
    messageText:
      mode === 'NEW_TICKET'
        ? "Seeing the prompt on Outlook every morning after reboot — I hit cancel and email still comes through, but it's getting noisy."
        : 'Pushed a new ADAL token package to your workstation. Reboot once and it should stop prompting.',
  })
  return { subject, html }
}

function previewReminderEmail() {
  const html = buildReminderHtml({
    toEmail: 'jen@acme.example',
    toName: 'Jen Baker',
    title: 'Approve the network-upgrade estimate',
    body: "Mike sent you an estimate last Wednesday — it's still waiting on your sign-off before we can order parts.",
    actionUrl: 'https://tickethub.pcc2k.com/portal/contact/example/estimates/42',
    actionLabel: 'Review estimate',
    portalUrl: 'https://tickethub.pcc2k.com/portal/contact/example',
    notifyCount: 1,
  })
  return { subject: '[PCC2K] Reminder: Approve the network-upgrade estimate', html }
}

// ── Registry ────────────────────────────────────────────────────────

const TEMPLATES: TicketHubTemplate[] = [
  {
    mode: 'NEW_TICKET',
    name: 'Ticket opened · client confirmation',
    description:
      "Sent to the client's primary contact (or billingEmail) the moment a ticket is opened on their behalf. Carries the [#TH-####] subject marker so their replies thread back in via the inbox webhook.",
    category: 'Tickets',
    source: 'app/lib/ticket-email.ts → sendTicketClientEmail({ mode: "NEW_TICKET" })',
    logged: true,
    preview: previewTicketEmail('NEW_TICKET'),
  },
  {
    mode: 'STAFF_REPLY',
    name: 'Staff reply · client notification',
    description:
      'Sent when a staff member posts a public comment on the ticket. Includes the comment body so the client can read it without signing in.',
    category: 'Tickets',
    source: 'app/lib/ticket-email.ts → sendTicketClientEmail({ mode: "STAFF_REPLY" })',
    logged: true,
    preview: previewTicketEmail('STAFF_REPLY'),
  },
  {
    mode: 'ONSITE_CONFIRMATION',
    name: 'On-site visit · confirmation',
    description:
      'Fires from the ✉ button on a scheduled appointment when the ticket is on the On-Site board and the on-site workflow automation is enabled. Confirms date, time, tech, site, and total duration with the primary contact.',
    category: 'Appointments',
    source: 'app/lib/actions/appointments.ts → sendOnsiteConfirmationEmail',
    logged: true,
  },
  {
    mode: 'REMINDER_NOTIFY',
    name: 'Reminder · follow-up nudge',
    description:
      'Sent by the /api/cron/reminder-notify job when a reminder hits its nextNotifyAt. Escalates through EVERY_3_DAYS / EVERY_WEEK cycles until the client ACKs, snoozes, or the parent item is resolved.',
    category: 'Reminders',
    source: 'app/lib/reminder-email.ts → sendReminderEmail (logged from cron)',
    logged: true,
    preview: previewReminderEmail(),
  },
  {
    mode: 'ESTIMATE_SENT',
    name: 'Estimate · delivery',
    description:
      'Sent when staff publishes an estimate. Includes the total + an approve/decline link that consumes a TH_ContactPortalToken (being retired in favor of the portal PortalMagicLink — Phase 3).',
    category: 'Estimates',
    source: 'app/lib/actions/estimates.ts → sendEstimateEmail',
    logged: true,
  },
  {
    mode: 'INVOICE_SENT',
    name: 'Invoice · delivery',
    description:
      'Sent when staff finalizes + emails an invoice. PDF attachment generated by @react-pdf/renderer from the configured invoice template. Tracks firstViewedAt via a tracking pixel.',
    category: 'Invoices',
    source: 'app/lib/actions/email.tsx → sendInvoiceEmail',
    logged: true,
  },
]

export function listTemplates(): TicketHubTemplate[] {
  return TEMPLATES
}

export function getTemplate(mode: string): TicketHubTemplate | null {
  return TEMPLATES.find((t) => t.mode === mode) ?? null
}
