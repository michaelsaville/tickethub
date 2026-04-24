# Stripe Activation — End-to-End Test Runbook

**Goal:** prove an invoice can be emailed, paid via Stripe Payment Link, and auto-flip to PAID in TicketHub — **before** Monday's go-live, before a real client sees it.

## Prereqs

1. **Stripe secret key + webhook secret in the environment.** Both live in `TH_Setting` (encrypted DB settings) or `~/tickethub/.env.local`, whichever you prefer:
   ```
   STRIPE_SECRET_KEY=sk_live_...          # or sk_test_ for first pass
   STRIPE_WEBHOOK_SECRET=whsec_...
   PORTAL_BASE_URL=https://portal.pcc2k.com
   ```
   Restart the TicketHub container after updating so the new env is picked up. Confirm:
   ```bash
   docker exec tickethub-app sh -c 'echo "secret=${STRIPE_SECRET_KEY:0:8}... webhook=${STRIPE_WEBHOOK_SECRET:0:8}..."'
   ```

2. **Webhook endpoint registered in Stripe dashboard.** Developers → Webhooks → Add endpoint:
   - URL: `https://tickethub.pcc2k.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `payment_intent.succeeded` (both required — Payment Link uses `checkout.session.completed`, saved-card off-session charges use `payment_intent.succeeded`)
   - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

3. **First pass with Stripe test mode**, then switch to live once green. The `sk_test_` key uses `https://dashboard.stripe.com/test/...`; test cards `4242 4242 4242 4242` exp any future, cvc 123.

---

## The test — 15 minutes, one sitting

### 1. Create a dedicated test client

In TicketHub: `/clients/new`
- Name: `STRIPE TEST — Michael Saville`
- Short code: `STRIPETEST`
- Billing state: `MD` (or any state — we just need a tax rate)
- Billing email: your real email address — this is where the invoice lands

Add one contact (your real email). Skip sites.

### 2. Open a throwaway ticket + log a charge

`/tickets/new` against the test client:
- Title: `Stripe activation test`
- Priority: low, type: INCIDENT
- Save → you're now on the ticket page.

On the ticket, use the **QuickCharge** card:
- Item: any LABOR item from the catalog (or create one at `/settings/items` if empty)
- Duration: 15 min
- Save. You should see the charge appear in the charges table with status **BILLABLE**.

### 3. Create and send the invoice

On the client page (`/clients/[id]`), click **"Invoice Client (1 billable)"** → lands on `/invoices/new?clientId=...` pre-filled.
- Confirm the charge is picked up, tax is ~6%, total > $0.
- Save → lands on the invoice detail page.
- Click **"Send"** (or transitions status DRAFT → SENT).
- Check your inbox. You should get an email with:
  - **[Pay Invoice $X.XX]** button
  - PDF attachment
  - Tracking pixel (invisible GIF)

### 4. Verify the Payment Link

Hover the pay button — the URL should be `https://buy.stripe.com/...` (Stripe-hosted Payment Link). If it's not there, `STRIPE_SECRET_KEY` is missing or `ensurePaymentLinkForInvoice` failed — check `docker logs tickethub-app --tail 100 | grep -i stripe`.

### 5. Pay with a real (or test) card

Click the button, fill out card details, complete checkout. Stripe redirects to `https://portal.pcc2k.com/invoices?paid=<invoiceId>`.

### 6. Verify the invoice flipped to PAID

Back in TicketHub, refresh the invoice page. Within ~5 seconds:
- Status badge should read **PAID**.
- `paidAt` timestamp should be populated.
- The Payment Link should be deactivated (reloading the link should show "This link is no longer available").

If status stays SENT, the webhook didn't land or the signature check failed:
```bash
docker logs tickethub-app --tail 100 | grep -i 'webhook/stripe'
```
Look for `invoice paid <id>` (success) or `bad signature` / `stripe not configured` (fail).

### 7. Verify tracking-pixel view counter

Open the invoice email in a browser. Refresh. Check `firstViewedAt` and `viewCount` on the invoice row — they should increment.

### 8. Confirm outbound log

`/admin/messages` → Log tab → filter mode `INVOICE_SENT`. You should see a row for the test invoice with status `SENT`, recipient = your email.

### 9. Clean up

- Void the test invoice (`/invoices/[id]` → admin action → VOID).
- Archive/close the test ticket.
- Leave the test client — useful for future regression checks.

---

## Failure modes to sanity-check

| Symptom | Cause | Fix |
|---|---|---|
| Email arrives but no pay button | `STRIPE_SECRET_KEY` not loaded in container env | Confirm with the `docker exec` command above; restart container |
| Pay button 404s on Stripe | Payment Link got deactivated (invoice already PAID or VOIDed) | Expected — re-send sends a fresh link if one is needed |
| Checkout redirects but status doesn't flip | Webhook not registered, or `STRIPE_WEBHOOK_SECRET` mismatches | Check Stripe dashboard → Developers → Webhooks → recent deliveries; look for 4xx responses |
| Webhook shows 400 "bad signature" | `STRIPE_WEBHOOK_SECRET` mismatch between Stripe dashboard and env | Copy the signing secret again, restart container |
| PDF attachment missing | React-PDF render failed; Helvetica glyph issue (smart quotes) | Check logs for `[pdf]` errors; grep for non-ASCII chars in invoice notes |
| Paid invoice shows negative / zero balance in portal | Working as designed — portal sums SENT+OVERDUE only | Not a bug |

---

## Go / no-go criteria

Before flipping to live mode with real clients:

- [ ] Test mode pass: end-to-end paid a test-card invoice, status auto-flipped, no errors in container logs.
- [ ] Switched `STRIPE_SECRET_KEY` to live key + repeated with a small real invoice against yourself as client.
- [ ] Webhook delivery in Stripe dashboard shows 200 responses (no retries stacking).
- [ ] Outbound log shows `INVOICE_SENT` row for the test invoice.
- [ ] You can answer: "If the webhook endpoint goes down for 5 minutes, what happens?" (Stripe retries with exponential backoff up to 3 days; no manual intervention needed — invoice will flip eventually.)

Once all checked, the "Stripe pay-invoice activation" line in `GO-LIVE.md` flips from DEFERRED to DONE.
