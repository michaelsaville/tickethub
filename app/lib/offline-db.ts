'use client'

import Dexie, { type Table } from 'dexie'

/**
 * Client-side IndexedDB queue for offline operations (PLANNING.md §11).
 * Operations are stored here when offline and flushed to /api/sync on reconnect.
 */

export type SyncOperationType =
  | 'ADD_COMMENT'
  | 'LOG_TIME'
  | 'UPDATE_STATUS'
  | 'ADD_PART'
  | 'ATTACH_PHOTO'
  | 'CAPTURE_SIGNATURE'

export interface SyncOperation {
  id: string
  type: SyncOperationType
  entityType: 'TICKET' | 'CHARGE'
  entityId: string
  payload: Record<string, unknown>
  createdAt: number
  retryCount: number
  error?: string
}

export interface CachedTicket {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  clientName: string
  updatedAt: number
  raw: unknown
}

class TicketHubDB extends Dexie {
  syncQueue!: Table<SyncOperation, string>
  tickets!: Table<CachedTicket, string>

  constructor() {
    super('tickethub')
    this.version(1).stores({
      syncQueue: 'id, type, entityId, createdAt',
      tickets: 'id, ticketNumber, status, updatedAt',
    })
  }
}

let db: TicketHubDB | null = null

export function getDB(): TicketHubDB {
  if (typeof window === 'undefined') {
    throw new Error('offline-db is client-only')
  }
  if (!db) db = new TicketHubDB()
  return db
}
