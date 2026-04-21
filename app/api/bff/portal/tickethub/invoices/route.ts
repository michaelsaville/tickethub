import { NextResponse } from "next/server"
import { prisma } from "@/app/lib/prisma"
import { verifyPortalHmac } from "@/app/lib/bff-hmac"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientName: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName) return NextResponse.json({ ok: false, error: "clientName required" }, { status: 400 })

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true, name: true },
  })
  if (!client) return NextResponse.json({ ok: true, client: null, invoices: [] })

  const invoices = await prisma.tH_Invoice.findMany({
    where: {
      clientId: client.id,
      status: { not: "DRAFT" },
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      issueDate: true,
      dueDate: true,
      totalAmount: true,
      sentAt: true,
      paidAt: true,
    },
    orderBy: [{ issueDate: "desc" }],
    take: 50,
  })

  const [balance] = await Promise.all([
    prisma.tH_Invoice.aggregate({
      _sum: { totalAmount: true },
      where: { clientId: client.id, status: { in: ["SENT", "OVERDUE"] }, deletedAt: null },
    }),
  ])

  return NextResponse.json({
    ok: true,
    client,
    invoices,
    balanceCents: balance._sum.totalAmount ?? 0,
  })
}
