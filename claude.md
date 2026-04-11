# TicketHub — Claude Code Context

## What This Is

TicketHub is an MSP ticketing and operations platform. It is a companion app to DocHub (github.com/michaelsaville/dochub), sharing the same PostgreSQL database, Microsoft Entra ID authentication, and Docker deployment infrastructure.

## Critical Architecture Decisions

Read PLANNING.md for full detail. The most important decisions:

1. **Charges are the billing backbone** — `TH_Charge` is the atomic billing unit. Every billable event is a Charge. Do not create parallel billing systems.

2. **Schema is additive-only** — Never rename or delete columns after first migration. Only add new fields/tables. Both DocHub and TicketHub share the same Postgres instance.

3. **All models are prefixed `TH_`** — This prevents conflicts with DocHub models in the shared database. The Prisma `@@map` uses `th_` prefix on all tables.

4. **All monetary values are stored as integers (cents)** — `1099` = $10.99. Never use floats for money.

5. **Soft deletes on financial data** — Tickets, charges, and invoices should never be hard-deleted. Use `isActive` or `deletedAt` fields.

6. **Finance-blind tech logging** — Techs never see prices when logging charges. Price resolution is automatic via a cascading hierarchy. See PLANNING.md Section 4 Decision 5.

## Tech Stack

- Next.js 15+ App Router
- TypeScript (strict mode)
- Prisma 6 + PostgreSQL 16
- NextAuth.js with Microsoft Entra ID
- Tailwind CSS
- next-pwa for PWA/Service Worker
- Dexie.js for IndexedDB offline queue
- Anthropic Claude API for AI features

## Project Structure

```
app/
  api/              ← API routes (REST)
  (tickethub)/      ← Main app route group
  components/
    shared/         ← Reusable UI components
    tickets/        ← Ticket-specific components
    charges/        ← Billing components
    mobile/         ← Mobile-specific components
    layout/         ← Sidebar, header, module switcher
  lib/
    prisma.ts       ← Prisma client singleton
    auth.ts         ← NextAuth config
    ai.ts           ← Claude API client
    notifications.ts ← ntfy/Pushover helpers
  hooks/            ← Custom React hooks
  types/            ← TypeScript types
prisma/
  schema.prisma     ← All TH_ models
```

## Design System

- Dark theme: background `#0a0f1a`, surface `#0d1526`, elevated `#1e293b`
- Accent color: amber/orange `#F97316`
- Status colors: New=blue, In Progress=amber, Waiting=purple, Resolved=green
- Priority: Urgent=red, High=orange, Medium=blue, Low=gray
- Font: DM Mono for UI labels, Inter for body text
- All spacing on 8px grid

## Coding Conventions

- All API routes return `{ data, error }` shape
- All Prisma queries use `try/catch` with proper error handling
- All monetary calculations done in cents (integers)
- TypeScript strict — no `any` types
- Server Components by default, `'use client'` only when needed for interactivity
- API routes validate session before any DB operation
- Use `getServerSession(authOptions)` from `lib/auth.ts` for auth checks

## Key Files to Read First

1. `PLANNING.md` — Complete architecture and feature spec
2. `prisma/schema.prisma` — All data models
3. `app/lib/prisma.ts` — Database client
4. `app/lib/auth.ts` — Auth configuration
5. `app/components/layout/Sidebar.tsx` — Navigation structure

## Environment Variables Required

See `.env.example` for all required variables. Critical ones:
- `DATABASE_URL` — same PostgreSQL as DocHub
- `NEXTAUTH_SECRET` — same secret as DocHub (shared sessions)
- `ANTHROPIC_API_KEY` — Claude API for AI features
- `NTFY_URL` — self-hosted ntfy for push notifications

## What NOT to Do

- Do not use `localStorage` — breaks SSR and PWA offline mode. Use Dexie.js.
- Do not use floats for money — always integers (cents)
- Do not hard-delete tickets, charges, or invoices
- Do not add DocHub-style models here — they live in DocHub's schema
- Do not bypass the charge lifecycle — charges must flow NOT_BILLABLE → BILLABLE → INVOICED → LOCKED
- Do not skip the cascading price resolution — never let techs set prices directly
