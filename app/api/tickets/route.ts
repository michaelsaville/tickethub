import { NextResponse, type NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { requireAuth } from '@/app/lib/api-auth'

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const sp = req.nextUrl.searchParams
  const where: Prisma.TH_TicketWhereInput = { deletedAt: null }

  const view = sp.get('view')
  if (view === 'mine') {
    where.assignedToId = session!.user.id
    where.status = { notIn: ['CLOSED', 'CANCELLED'] }
  } else if (view === 'unassigned') {
    where.assignedToId = null
    where.status = { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] }
  } else if (view === 'recent') {
    where.updatedAt = { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
  } else if (!sp.get('status')) {
    where.status = { notIn: ['CLOSED', 'CANCELLED'] }
  }

  const status = sp.get('status')
  if (status) {
    where.status = status as Prisma.TH_TicketWhereInput['status']
  }
  const priority = sp.get('priority')
  if (priority) {
    where.priority = priority as Prisma.TH_TicketWhereInput['priority']
  }
  const assigneeId = sp.get('assigneeId')
  if (assigneeId) {
    where.assignedToId = assigneeId === 'none' ? null : assigneeId
  }
  const clientId = sp.get('clientId')
  if (clientId) where.clientId = clientId
  const q = sp.get('q')
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const take = Math.min(Number.parseInt(sp.get('limit') ?? '100', 10) || 100, 500)

  const tickets = await prisma.tH_Ticket.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    take,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      isUnread: true,
      updatedAt: true,
      createdAt: true,
      slaResolveDue: true,
      slaPausedAt: true,
      slaBreached: true,
      client: { select: { id: true, name: true, shortCode: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  })
  return NextResponse.json({ data: tickets, error: null })
}
