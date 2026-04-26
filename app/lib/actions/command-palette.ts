'use server'

import { getServerSession } from 'next-auth'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'

export type PaletteResult =
  | { kind: 'ticket'; id: string; ticketNumber: number; title: string; clientName: string | null; status: string; href: string }
  | { kind: 'client'; id: string; name: string; shortCode: string | null; href: string }
  | { kind: 'contact'; id: string; name: string; email: string | null; clientName: string; href: string }
  | { kind: 'kb'; id: string; title: string; href: string }

export type PaletteSearchResponse = {
  tickets: PaletteResult[]
  clients: PaletteResult[]
  contacts: PaletteResult[]
  kb: PaletteResult[]
}

const EMPTY: PaletteSearchResponse = { tickets: [], clients: [], contacts: [], kb: [] }

export async function paletteSearch(query: string): Promise<PaletteSearchResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return EMPTY
  const q = query.trim()
  if (q.length < 2) return EMPTY

  // Numeric-only query → treat as ticket-number lookup primarily.
  const asNumber = /^\d+$/.test(q) ? parseInt(q, 10) : null

  const [tickets, clients, contacts, kb] = await Promise.all([
    prisma.tH_Ticket.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(asNumber !== null ? [{ ticketNumber: asNumber }] : []),
          { title: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        client: { select: { name: true } },
      },
    }),
    prisma.tH_Client.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { shortCode: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true, shortCode: true },
    }),
    prisma.tH_Contact.findMany({
      where: {
        isActive: true,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' as const } },
          { lastName: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        client: { select: { name: true } },
      },
    }),
    prisma.tH_KBArticle.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { tags: { has: q.toLowerCase() } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true },
    }),
  ])

  return {
    tickets: tickets.map((t) => ({
      kind: 'ticket' as const,
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      clientName: t.client?.name ?? null,
      status: t.status,
      href: `/tickets/${t.id}`,
    })),
    clients: clients.map((c) => ({
      kind: 'client' as const,
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
      href: `/clients/${c.id}`,
    })),
    contacts: contacts.map((c) => ({
      kind: 'contact' as const,
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      clientName: c.client?.name ?? '',
      href: `/clients/${c.id}#contact-${c.id}`,
    })),
    kb: kb.map((a) => ({
      kind: 'kb' as const,
      id: a.id,
      title: a.title,
      href: `/kb/${a.id}`,
    })),
  }
}

export type RecentTicketDTO = {
  id: string
  ticketNumber: number
  title: string
  clientName: string | null
  status: string
}

/** Recent tickets the current user has touched (assigned to them, ordered by updatedAt). */
export async function paletteRecentTickets(): Promise<RecentTicketDTO[]> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return []
  const rows = await prisma.tH_Ticket.findMany({
    where: {
      deletedAt: null,
      OR: [
        { assignedToId: session.user.id },
        { createdById: session.user.id },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      client: { select: { name: true } },
    },
  })
  return rows.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    clientName: t.client?.name ?? null,
    status: t.status,
  }))
}
