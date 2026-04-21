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

  let payload: { clientName: string; estimateId: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientName || !payload.estimateId) return NextResponse.json({ ok: false, error: "clientName + estimateId required" }, { status: 400 })

  const client = await prisma.tH_Client.findFirst({
    where: { name: payload.clientName, isActive: true },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })

  const estimate = await prisma.tH_Estimate.findFirst({
    where: { id: payload.estimateId, clientId: client.id, status: { not: "DRAFT" } },
    select: {
      id: true,
      estimateNumber: true,
      title: true,
      description: true,
      status: true,
      subtotal: true,
      taxAmount: true,
      totalAmount: true,
      validUntil: true,
      sentAt: true,
      approvedAt: true,
      declinedAt: true,
      convertedAt: true,
      notes: true,
      items: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          item: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
  if (!estimate) return NextResponse.json({ ok: false, error: "estimate not found" }, { status: 404 })

  return NextResponse.json({ ok: true, estimate })
}
