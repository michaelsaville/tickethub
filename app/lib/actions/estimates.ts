import 'server-only'
import { prisma } from '@/app/lib/prisma'
import { formatCents } from '@/app/lib/billing'
import { sendMail } from '@/app/lib/mail'

type EstimateWithRelations = {
  id: string
  estimateNumber: number
  title: string
  description: string | null
  totalAmount: number
  validUntil: Date | null
  client: { name: string; billingEmail: string | null }
  contact: { firstName: string; lastName: string; email: string | null } | null
  items: { item: { name: string }; quantity: number; unitPrice: number; totalPrice: number; description: string | null }[]
}

export async function sendEstimateEmail(estimate: EstimateWithRelations) {
  const recipientEmail = estimate.client.billingEmail || estimate.contact?.email
  if (!recipientEmail) {
    console.warn(`Estimate #${estimate.estimateNumber}: no recipient email`)
    return
  }

  // Generate a portal token for the contact
  let portalUrl = `https://tickethub.pcc2k.com/estimates/${estimate.id}`
  if (estimate.contact) {
    const contact = await prisma.tH_Contact.findFirst({
      where: { clientId: (estimate as any).clientId, email: recipientEmail },
    })
    if (contact) {
      const token = await prisma.tH_ContactPortalToken.create({
        data: {
          contactId: contact.id,
          token: crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 30 * 86400000), // 30 days
        },
      })
      portalUrl = `https://tickethub.pcc2k.com/estimate/${estimate.id}?token=${token.token}`
    }
  }

  const itemRows = estimate.items.map(i =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${i.item.name}${i.description ? `<br><small style="color:#6b7280">${i.description}</small>` : ''}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatCents(i.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatCents(i.totalPrice)}</td>
    </tr>`
  ).join('')

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#F97316;color:#fff;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">Estimate #${estimate.estimateNumber}</h2>
        <p style="margin:4px 0 0;opacity:0.9">${estimate.title}</p>
      </div>
      <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none">
        <p>Hello ${estimate.contact?.firstName || 'there'},</p>
        <p>Please review the following estimate from PCC2K:</p>
        ${estimate.description ? `<p style="color:#6b7280">${estimate.description}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px;text-align:left">Item</th>
              <th style="padding:8px;text-align:center">Qty</th>
              <th style="padding:8px;text-align:right">Unit</th>
              <th style="padding:8px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:8px;text-align:right;font-weight:bold">Total:</td>
              <td style="padding:8px;text-align:right;font-weight:bold;font-size:16px">${formatCents(estimate.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
        ${estimate.validUntil ? `<p style="color:#6b7280;font-size:13px">Valid until: ${estimate.validUntil.toLocaleDateString()}</p>` : ''}
        <div style="margin:24px 0;text-align:center">
          <a href="${portalUrl}" style="background:#F97316;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">Review & Approve</a>
        </div>
        <p style="font-size:12px;color:#9ca3af;margin-top:24px">PCC2K · Precision Computer Consulting</p>
      </div>
    </div>
  `

  await sendMail({
    to: recipientEmail,
    subject: `Estimate #${estimate.estimateNumber}: ${estimate.title} — ${formatCents(estimate.totalAmount)}`,
    html,
  })
}
