'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/app/lib/prisma'
import { authOptions } from '@/app/lib/auth'
import { hasMinRole } from '@/app/lib/api-auth'
import { m365Configured, senderUpn, sendMail } from '@/app/lib/m365'
import { ensurePaymentLinkForInvoice } from '@/app/lib/stripe'
import { InvoicePdf, type InvoicePdfData } from '@/app/lib/pdf/InvoicePdf'
import { ORG } from '@/app/lib/org'
import { formatCents } from '@/app/lib/billing'

export type SendInvoiceResult = { ok: true } | { ok: false; error: string }

export async function sendInvoiceEmail(
  invoiceId: string,
  overrides: { to: string; cc?: string; subject?: string; note?: string },
): Promise<SendInvoiceResult> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { ok: false, error: 'Unauthorized' }
  if (!hasMinRole(session.user.role, 'TICKETHUB_ADMIN')) {
    return { ok: false, error: 'Admin role required' }
  }
  if (!m365Configured()) {
    return {
      ok: false,
      error: 'M365 not configured — set M365_SENDER_UPN on the container',
    }
  }

  const to = overrides.to
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const cc = overrides.cc
    ? overrides.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    : []
  if (to.length === 0) return { ok: false, error: 'At least one recipient is required' }

  try {
    const invoice = await prisma.tH_Invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { name: true, billingState: true } },
        charges: {
          orderBy: { workDate: 'asc' },
          include: {
            item: { select: { name: true } },
            ticket: { select: { ticketNumber: true, title: true } },
          },
        },
      },
    })
    if (!invoice) return { ok: false, error: 'Invoice not found' }

    // Render the PDF fresh at send time so the customer gets the current
    // state of the invoice, not a stale snapshot.
    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoiceNumber,
      status: 'SENT',
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      taxableSubtotal: invoice.taxableSubtotal,
      taxState: invoice.taxState,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      notes: invoice.notes,
      client: invoice.client,
      lineItems: invoice.charges.map((c) => ({
        itemName: c.item.name,
        description: c.description,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        totalPrice: c.totalPrice,
        timeChargedMinutes: c.timeChargedMinutes,
        ticket: c.ticket
          ? { ticketNumber: c.ticket.ticketNumber, title: c.ticket.title }
          : null,
      })),
    }
    const buffer = await renderToBuffer(<InvoicePdf data={pdfData} />)

    const subject =
      overrides.subject?.trim() ||
      `Invoice #${invoice.invoiceNumber} from ${ORG.name}`
    const dueLine = invoice.dueDate
      ? `Due ${invoice.dueDate.toLocaleDateString()}.`
      : ''
    const trackingUrl = `${process.env.NEXTAUTH_URL ?? 'https://tickethub.pcc2k.com'}/api/invoices/${invoiceId}/viewed`

    // Sticky Stripe Payment Link — created once, stored on the invoice,
    // reused on every re-send. Stays valid until the invoice gets paid
    // or voided. null when Stripe isn't configured; the email falls
    // back to "reply to pay" in that case.
    const payUrl = await ensurePaymentLinkForInvoice(invoiceId)
    const payButton = payUrl
      ? `<p style="margin:16px 0">
          <a href="${payUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Pay online — ${formatCents(invoice.totalAmount)}</a>
        </p>
        <p style="color:#888;font-size:12px;margin:-4px 0 12px">Card or ACH. This link stays valid until the invoice is paid.</p>`
      : ''

    const html = `
<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, sans-serif; font-size: 14px; color: #111; max-width: 560px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #F97316; margin: 0 0 12px 0;">${escapeHtml(ORG.name)}</h2>
    <p>Hi ${escapeHtml(invoice.client.name)},</p>
    <p>
      Invoice <strong>#${invoice.invoiceNumber}</strong> is attached as a PDF.
      Total due: <strong>${formatCents(invoice.totalAmount)}</strong>.
      ${dueLine}
    </p>
    ${payButton}
    ${overrides.note ? `<p>${escapeHtml(overrides.note).replace(/\n/g, '<br>')}</p>` : ''}
    <p>Questions? Reply to this email or call ${escapeHtml(ORG.phone)}.</p>
    <p style="color: #888; margin-top: 24px; font-size: 12px;">
      ${escapeHtml(ORG.name)} · ${escapeHtml(ORG.website)}<br>
      ${escapeHtml(ORG.address)}, ${escapeHtml(ORG.city)}, ${escapeHtml(ORG.state)} ${escapeHtml(ORG.zip)}
    </p>
    <img src="${trackingUrl}" width="1" height="1" alt="" style="display:block;border:0" />
  </body>
</html>
    `.trim()

    await sendMail({
      to,
      cc,
      subject,
      html,
      attachments: [
        {
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          contentType: 'application/pdf',
          contentBytes: Buffer.from(buffer).toString('base64'),
        },
      ],
    })

    // Transition the invoice to SENT and lock the charges in the same tx
    // as the DB state flip. The email already went out — we're just
    // recording it.
    await prisma.$transaction(async (tx) => {
      await tx.tH_Invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      })
      await tx.tH_Charge.updateMany({
        where: { invoiceId },
        data: { status: 'LOCKED' },
      })
    })

    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/invoices')
    return { ok: true }
  } catch (e: unknown) {
    console.error('[actions/email] sendInvoice failed', e)
    const msg = e instanceof Error ? e.message : 'Send failed'
    return { ok: false, error: msg }
  }
}

export async function m365Status(): Promise<{
  configured: boolean
  sender: string
}> {
  return {
    configured: m365Configured(),
    sender: senderUpn(),
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
