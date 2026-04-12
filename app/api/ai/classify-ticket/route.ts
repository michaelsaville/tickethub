import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { prisma } from '@/app/lib/prisma'
import { classifyTicket } from '@/app/lib/ai-classify'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    title?: string
    description?: string
    clientId?: string
  }

  const title = body.title?.trim()
  if (!title) {
    return NextResponse.json(
      { error: 'Title is required' },
      { status: 400 },
    )
  }

  try {
    // Resolve client name
    let clientName = 'Unknown'
    if (body.clientId) {
      const client = await prisma.tH_Client.findUnique({
        where: { id: body.clientId },
        select: { name: true },
      })
      if (client) clientName = client.name
    }

    // Get active tech names for assignee suggestion
    const techs = await prisma.tH_User.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    })

    const result = await classifyTicket({
      title,
      description: body.description?.trim() || null,
      clientName,
      techNames: techs.map((t) => t.name),
    })

    return NextResponse.json({ data: result })
  } catch (e) {
    console.error('[api/ai/classify-ticket]', e)
    const message =
      e instanceof Error && e.message.includes('ANTHROPIC_API_KEY')
        ? 'AI not configured — set ANTHROPIC_API_KEY in .env.local'
        : 'Classification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
