# TicketHub — Go-Live Checklist

**Target:** Monday 2026-04-27
**Live URL:** https://tickethub.pcc2k.com
**Companion apps:** [DocHub](https://dochub.pcc2k.com) · [Portal](https://portal.pcc2k.com) · [BizHub](https://bizhub.pcc2k.com)

---

## Status Summary

| Area | State |
|---|---|
| Phases 1–6 complete (ticketing, billing, mobile/offline, AI, integrations, reporting) | DONE |
| Portal BFF integration (9 read + 3 write paths) | DONE |
| Syncro billing migration (39 estimates, 338 invoices, 496 tickets, 140 clients, 42 contacts) | DONE |
| On-site workflow (`ticket.board='On-Site'` + scheduler) | DONE |
| Client portal live at portal.pcc2k.com | DONE |
| Tax rates seeded — WV/MD/PA = 6% flat for reporting | DONE (2026-04-21) |
| BillingState on all 138 active clients (MD=89, WV=39, PA=10) | DONE (2026-04-21) |
| Outbound email log — all 5 senders wired | DONE (2026-04-21) |
| Crons: sla-check (5m), m365-renew (6h), reminder-notify (5m), estimate-expire (daily 08:00 EDT) | DONE |
| Stripe pay-invoice activation | DEFERRED to post-testing |

---

## Remaining This Week (2026-04-22 → 26)

### User-only tasks
- [ ] **Michael Frye first sign-in** — placeholder `entraId='pending:mfrye@pcc2k.com'` auto-upgrades on first Entra login. Ping him to sign in at least once before Monday so we know it works.
- [ ] **Subscribe ntfy app on my phone + Frye's phone** to `https://ntfy.pcc2k.com/tickethub` and test one push. Known gotcha: some Android battery optimizers throttle instant-delivery — verify notification arrives within ~5 sec of a test.
- [ ] **Rotate GitHub PAT** at github.com/settings/tokens (carried over from the DocHub security review 2026-04-10)
- [ ] **Decide Dan Fisher state** if intentional MD (already set per 2026-04-21 backfill)

### Testing (can do anytime this week)
- [ ] **Self-invoice dry-run** — pick yourself (Michael Saville, MD) as client, add one charge, generate PDF, email. Exercises: tax rate @ 6%, M365 send (`accounting@pcc2k.com`), PDF render, outbound log write, tracking pixel.
- [ ] **Send an estimate end-to-end** to a test contact. Check it shows up on portal `/estimates` and the approve/decline flow works.
- [ ] **Verify 3 random Syncro invoices** render correctly vs their Syncro `pdf_url` — pick one each from 2025 Q4, 2024, and a recent one. Check totals + tax + client name.
- [ ] **Create a ticket + reply via email** to confirm inbound M365 webhook still thread-matches (validated 2026-04-11; re-run now that portal BFF is live).
- [ ] **`/admin/messages` page** — confirm all templates render previews, Sent log shows the 7 modes (NEW_TICKET, STAFF_REPLY, REMINDER_NOTIFY, ESTIMATE_SENT, INVOICE_SENT, ONSITE_CONFIRMATION, PORTAL_RELAY).
- [ ] **Dispatch grid** — confirm Frye appears in `/schedule` after his `isOnsiteTech` and active flags.

### Optional polish
- [ ] React-PDF invoice template — swap Helvetica for DM Mono once a font file is bundled (cosmetic)
- [ ] Site lat/lng for at least top-5 clients — needed for on-site GPS proximity detection; currently requires SQL (no UI editor)

---

## Monday 2026-04-27 — Launch Day

### Morning pre-flight (before 8am)
- [ ] Tail `~/tickethub/cron.log` — confirm overnight sla-check, reminder-notify, 08:00 UTC m365-renew all ran clean
- [ ] Confirm `tickethub-app` container `Up (healthy)`: `docker ps | grep tickethub`
- [ ] Spot-check tickethub.pcc2k.com loads + sign in via Entra
- [ ] Spot-check portal.pcc2k.com — click through as staff on one client's `/clients/[id]` → "View as client"
- [ ] Confirm ntfy subscriptions on both phones still showing green/instant

### During the day
- [ ] Stop creating tickets in Syncro
- [ ] Triage any inbound emails into TH instead
- [ ] First billable charge → first native TH invoice → send it
- [ ] Monitor ntfy team topic for the new-ticket broadcasts
- [ ] Keep Syncro tab open for archival lookups only — `pdf_url` is source of truth for pre-migration invoice detail

### End of day
- [ ] Check `TH_TicketEmailOutbound` for anything stuck in `FAILED` status
- [ ] Check `/admin/messages` Sent log
- [ ] Pull `docker logs tickethub-app --since 24h | grep -i error` — expect quiet

---

## Week 1 Monitoring

- [ ] Daily: `cron.log` tail — any non-zero exits
- [ ] Daily: check for `FAILED` outbound rows
- [ ] Watch for first unassigned-ticket ntfy broadcast working correctly (new behavior shipped 2026-04-21)
- [ ] Confirm SLA timers are pausing on WAITING_* states (client-side ticker + server-side)
- [ ] First estimate approval via portal — confirm it writes to `TH_Estimate.notes` audit line
- [ ] After ~3–5 invoices, revisit Stripe activation decision

---

## Stripe Activation (when ready)

**Blocker:** env vars missing from `~/tickethub/.env.local`

1. Create Stripe account (or use existing)
2. Dashboard → Developers → API keys → copy `sk_test_…` first, then `sk_live_…`
3. Developers → Webhooks → add endpoint `https://tickethub.pcc2k.com/api/webhooks/stripe`, subscribe to `checkout.session.completed` + `payment_intent.succeeded`, copy `whsec_…`
4. Append to `~/tickethub/.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
5. `cd ~/tickethub && docker compose up -d --force-recreate app`
6. Test: send a test invoice → Stripe hosted page → card `4242 4242 4242 4242` → confirm invoice flips to `PAID` via webhook

Code already deployed; activation is pure env-var flip. Code gracefully degrades when keys missing (email sends without Pay button, webhook returns 503).

---

## Deferred (post-launch)

- [ ] ConnectWise RMM credentials (webhook already coded at `/api/webhooks/connectwise-rmm`)
- [ ] QuickBooks OAuth (invoice → QB one-way sync coded)
- [ ] Amazon PA-API credentials (product lookup + price cache coded)
- [ ] Entra Mail.Send Application Access Policy harden — already scoped to accounting@ + helpdesk@ (done 2026-04-19)
- [ ] Site lat/lng geocoding + `/settings/sites` editor
- [ ] Reminders cron: switch from Syncro pull to native `TH_Estimate` rows (once portal estimate flow is proven)
- [ ] Voice site survey (spec only, not built)
- [ ] Per-user GPS tracking prefs (hours/days/on-off — spec only)
- [ ] Fix latent login callbackUrl `0.0.0.0` bug next time auth code is touched

---

## Quick Reference

### URLs
- App: https://tickethub.pcc2k.com
- Client portal: https://portal.pcc2k.com
- ntfy (team topic): https://ntfy.pcc2k.com/tickethub
- Admin: `/admin/messages` · `/settings/tax-rates` · `/settings/automations` · `/settings/users` · `/settings/integrations`

### Key commands (run from DocHub server where TicketHub lives)
```bash
# Typecheck
docker run --rm -v ~/tickethub:/app -w /app -u "$(id -u):$(id -g)" \
  -e HOME=/tmp node:20-alpine npx --offline tsc --noEmit

# Rebuild + deploy
cd ~/tickethub && docker compose build app && docker compose up -d app

# Schema change (shared DB — NEVER pass --accept-data-loss)
docker run --rm -v ~/tickethub:/app -w /app -u "$(id -u):$(id -g)" \
  -e HOME=/tmp --network dochub_default node:20-alpine npx --offline prisma db push

# Container logs
docker logs tickethub-app -f

# Manual SLA cron trigger
curl -H "Authorization: Bearer $(grep ^CRON_SECRET ~/tickethub/.env.local | cut -d= -f2-)" \
  https://tickethub.pcc2k.com/api/cron/sla-check

# Bootstrap a global admin
docker exec dochub-db-1 psql -U dochub -d dochub \
  -c "UPDATE tickethub.th_users SET role='GLOBAL_ADMIN' WHERE email='me@example.com'"

# Team broadcast (for announcements)
curl -X POST -d "message body" -H "Title: Title" https://ntfy.pcc2k.com/tickethub
```

### Users
- Michael Saville — GLOBAL_ADMIN, onsite tech, primary
- Michael Frye — TICKETHUB_ADMIN, onsite tech, placeholder entraId (`pending:mfrye@pcc2k.com`) — upgrades on first sign-in

### Cron schedule (host `crontab -l`)
```
*/5 * * * * sla-check
*/5 * * * * reminder-notify
0 */6 * * * m365-subscription-renew
0 12 * * * estimate-expire            # daily 08:00 EDT
```

### Tax rates (DB)
- All three states = 600 bps (6%) by deliberate choice — simplicity for reporting, NOT jurisdictional accuracy. Do not "correct" without deciding that's actually needed.

### Client state distribution (2026-04-21)
- MD: 89 · WV: 39 · PA: 10 · Total active: 138

---

## Gotchas — Do Not Forget

- **Shared Postgres database with DocHub.** `prisma db push` is bounded by `datasource db { schemas = ["tickethub"] }` + `@@schema("tickethub")` on every model. Never revert this; never add a new model without `@@schema`. Never pass `--accept-data-loss` on the shared DB.
- **Two ticket-create paths:** `app/lib/actions/tickets.ts::createTicket` (UI) and `app/lib/tickets-core.ts::createTicketCore` (email/inbox). New ticket-create side effects must be added to BOTH or UI creates silently skip them.
- **nginx `client_max_body_size`** — must be set explicitly on tickethub.pcc2k.com vhost or uploads silently 413 at 1MB.
- **next-auth middleware matcher** — must include `api/cron|api/webhooks` in the negative lookahead or cron endpoints 307-redirect to sign-in.
- **next-pwa intercepts OAuth callbacks** on mobile — `/api/*` is excluded from runtime caching; don't revert.
- **`@react-pdf` requires React 19** and Helvetica is ASCII-safe only (no em-dashes, smart quotes, arrows). Stick to plain ASCII in PDF and email templates or bundle a real font.
- **`'use server'` files export async only** — non-async exports break `next build` (dev is permissive).
- **Watchtower on the host is scoped to ghcr-sourced images.** TicketHub uses `tickethub:local` so watchtower won't race its rebuilds. DocHub runs from ghcr so DO stop watchtower before local DocHub iteration.
- **Notification dispatch is fire-and-forget** — never block user actions on push failures. But server actions that call `redirect()` afterward should `await` the notify call or the promise can die before the fetch lands (learned 2026-04-21).
- **Client email match for portal** is exact-name-match between DocHub.Client.name and TH_Client.name. If renames start breaking portal lookups, add `dochubClientId` FK on TH_Client — don't chase the rename.
- **Estimate/invoice line items from Syncro** — only estimate items were migrated (105 total, attached to synthetic `TH_Item "Imported line item"`). Invoice line items NOT migrated; Syncro `pdf_url` is source of truth for historical invoice detail.

---

## Session Log (2026-04-21)

- Ntfy new-ticket broadcast shipped — every new ticket now pings shared topic, not just URGENT/HIGH (phone-app-sync was the culprit on the "no notification" bug, not code).
- Estimate-expire cron added to host crontab (`0 12 * * *`).
- Reminder, estimate, and invoice senders wired into `TH_TicketEmailOutbound` — all 7 modes now log (NEW_TICKET, STAFF_REPLY, ONSITE_CONFIRMATION, REMINDER_NOTIFY, ESTIMATE_SENT, INVOICE_SENT, PORTAL_RELAY).
- Tax rates seeded at 6% for WV/MD/PA.
- BillingState backfilled for all 138 active clients using Syncro address data + user-directed categorization of 46 outliers.
- Deactivated `[Example] Acme Tech Solutions` (Syncro demo), Jim Guy, Jody Nyland.
