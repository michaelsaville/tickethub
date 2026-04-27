/**
 * Automation engine event types.
 *
 * Phase 0: bus is in place; every existing mutation emits a typed event
 * via `emit()`. Rules/evaluator ship in Phase 1.
 *
 * Event names are stable strings — triggers reference them by exact match.
 * Entity data is NOT embedded in payload; the Phase 1 evaluator will
 * hydrate entities from `entityType` + `entityId` at evaluation time so
 * rule conditions always read current state (not a stale snapshot).
 */

export type EntityType =
  | 'ticket'
  | 'charge'
  | 'invoice'
  | 'estimate'
  | 'appointment'
  | 'contract'
  | 'reminder'
  | 'email'
  | 'user'

export interface AutomationEvent {
  /** Event name, e.g. "ticket.created". Use a value from EVENT_TYPES. */
  type: string
  entityType: EntityType
  entityId: string
  /** Event-specific fields. Do not stuff entity state in here. */
  payload?: Record<string, unknown>
  /** User who caused the event, if any. Null for system/cron-triggered. */
  actorId?: string | null
  /** When the mutation happened. Defaults to now at emit time. */
  occurredAt?: Date
  /** Chain tracking (set by Phase 1 evaluator when child events fire). */
  chainId?: string
  chainDepth?: number
  parentRunId?: string | null
}

/**
 * Canonical event names. Use these constants at call sites to avoid
 * typos; Phase 1 triggers match by exact string.
 */
export const EVENT_TYPES = {
  // Ticket lifecycle
  TICKET_CREATED: 'ticket.created',
  TICKET_CREATED_FROM_INBOUND: 'ticket.created_from_inbound',
  TICKET_STATUS_CHANGED: 'ticket.status_changed',
  TICKET_ASSIGNED: 'ticket.assigned',
  TICKET_UNASSIGNED: 'ticket.unassigned',
  TICKET_PRIORITY_CHANGED: 'ticket.priority_changed',
  TICKET_TYPE_CHANGED: 'ticket.type_changed',
  TICKET_BOARD_CHANGED: 'ticket.board_changed',
  TICKET_TAG_ADDED: 'ticket.tag_added',
  TICKET_TAG_REMOVED: 'ticket.tag_removed',
  TICKET_CONTRACT_CHANGED: 'ticket.contract_changed',
  TICKET_COMMENT_ADDED: 'ticket.comment_added',
  TICKET_SLA_THRESHOLD_CROSSED: 'ticket.sla_threshold_crossed',
  TICKET_REOPENED: 'ticket.reopened',
  CSAT_RESPONSE_RECEIVED: 'ticket.csat_response_received',

  // Charge
  CHARGE_ADDED: 'charge.added',
  CHARGE_BILLABLE_TOGGLED: 'charge.billable_toggled',
  CHARGE_DELETED: 'charge.deleted',

  // Invoice
  INVOICE_CREATED: 'invoice.created',
  INVOICE_STATUS_CHANGED: 'invoice.status_changed',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_VOIDED: 'invoice.voided',

  // Estimate
  ESTIMATE_CREATED: 'estimate.created',
  ESTIMATE_SENT: 'estimate.sent',
  ESTIMATE_APPROVED: 'estimate.approved',
  ESTIMATE_DECLINED: 'estimate.declined',
  ESTIMATE_EXPIRED: 'estimate.expired',
  ESTIMATE_CONVERTED: 'estimate.converted',

  // Appointment
  APPOINTMENT_SCHEDULED: 'appointment.scheduled',
  APPOINTMENT_STATUS_CHANGED: 'appointment.status_changed',
  APPOINTMENT_COMPLETED: 'appointment.completed',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
