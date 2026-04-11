import type {
  TH_Ticket,
  TH_TicketStatus,
  TH_TicketPriority,
  TH_Charge,
  TH_ChargeStatus,
  TH_Client,
  TH_User,
} from '@prisma/client'

export type TicketHubRole =
  | 'GLOBAL_ADMIN'
  | 'TICKETHUB_ADMIN'
  | 'TECH'
  | 'DISPATCHER'
  | 'VIEWER'

export type ApiResponse<T> = { data: T; error: null } | { data: null; error: string }

export type TicketWithRelations = TH_Ticket & {
  client: Pick<TH_Client, 'id' | 'name' | 'shortCode'>
  assignedTo: Pick<TH_User, 'id' | 'name' | 'email'> | null
}

export type { TH_TicketStatus, TH_TicketPriority, TH_Charge, TH_ChargeStatus }

export type SLAHealth = 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'BREACHED' | 'PAUSED'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
  }
}
