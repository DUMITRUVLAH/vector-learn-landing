---
id: BILL-001
title: "Schema fin_invoices + fin_invoice_lines + fin_invoice_reminders + migration 0117"
milestone: FIN
phase: "5"
status: pending
attempts: 0
depends_on: [AGREEMENT-001, REGISTRY-002]
spec: backlog/specs/BILL-001.md
branch: feat/FIN-bill
---

## Goal

Definirea schemei DB pentru **facturile B2B FinDesk** (`fin_invoices`) separate complet de
tabelul `invoices` (CRM, facturare elevi). Contextele sunt diferite: `fin_invoices` este pentru
facturare comercială (partener → servicii din contract), `invoices` este pentru plăți elevi.
**Nu modificăm tabelul `invoices`** — FIN-CORE §1.5: separare completă B2B vs B2C.

Schema include:
- `fin_invoices` — factura propriu-zisă (legată opțional de un contract)
- `fin_invoice_lines` — linii factură (servicii, cantitate, TVA per linie — regula #1: TVA obligatoriu)
- `fin_invoice_reminders` — remindere de plată per factură (refolosim logica din `invoiceReminders`)

Migrarea 0117 creează cele 3 tabele fără a atinge schema `invoices` existentă.

## User stories

- **Ca** contabil, **vreau** să am tabele separate pentru facturile B2B față de cele B2C (elevi),
  **pentru că** contabilitatea comercială are reguli TVA și numerotare diferite.
- **Ca** sistem (BILL-002), **vreau** să inserez facturi cu linii și TVA per linie,
  **pentru că** regula #1: TVA se calculează per linie, nu global.
- **Ca** contabil, **vreau** să înregistrez remindere de plată pe facturi B2B,
  **pentru că** urmăresc colectarea datoriilor de la parteneri comerciali.
- **Ca** director, **vreau** că schema să suporte facturare din contract SAU ad-hoc,
  **pentru că** nu toate facturile vin dintr-un contract existent.

## Acceptance criteria

- [ ] `server/db/schema/finInvoices.ts` cu tabelele:
  - `fin_invoices`:
    - `id` (UUID PK), `tenantId` (FK → tenants, onDelete cascade)
    - `agreementId` (FK → fin_agreements.id, onDelete set null, nullable) — null = ad-hoc
    - `partyId` (FK → fin_parties.id, onDelete set null, nullable) — destinatarul facturii
    - `series` (varchar 20, default `FIN`), `number` (integer) — seria și numărul facturii
    - `invoiceNumber` (varchar 30) — format `FIN-2026-0001`, setat la INSERT de server
    - `status` enum: `draft | issued | paid | overdue | cancelled`
    - `currency` (char 3, default `MDL`)
    - `issuedAt` (timestamp nullable), `dueDate` (date nullable)
    - `totalCents` (integer, computed la INSERT/UPDATE ca suma liniilor cu TVA)
    - `vatTotalCents` (integer, suma TVA din toate liniile)
    - `notes` (text nullable)
    - `createdAt`, `updatedAt`
  - `fin_invoice_lines`:
    - `id` (UUID PK), `invoiceId` (FK → fin_invoices.id, onDelete cascade)
    - `description` (text NOT NULL) — descrierea serviciului/produsului
    - `quantity` (integer default 1, NOT NULL)
    - `unitPriceCents` (integer NOT NULL, >= 0)
    - `vatPct` (integer NOT NULL, 0–100) — **TVA obligatoriu per linie** (FIN-CORE regula #1)
    - `lineTotalCents` (integer) — `quantity * unitPriceCents * (1 + vatPct/100)`, rotunjit
    - `serviceId` (FK → fin_agreement_services.id, onDelete set null, nullable) — legătură opțională
    - `createdAt`
  - `fin_invoice_reminders`:
    - `id` (UUID PK), `tenantId` (FK → tenants, onDelete cascade)
    - `invoiceId` (FK → fin_invoices.id, onDelete cascade)
    - `reminderDay` (integer NOT NULL) — zile după scadență (3, 7, 14)
    - `channel` (varchar 20, default `email`)
    - `status` (varchar 20, default `sent`) — `sent | failed | cancelled`
    - `body` (varchar 2000)
    - `sentAt` (timestamp NOT NULL defaultNow())
    - `createdAt`
    - Unique constraint: `(invoiceId, reminderDay)` — idempotency
  - Indexuri:
    - `fin_invoices_tenant_idx` (tenantId)
    - `fin_invoices_party_idx` (tenantId, partyId)
    - `fin_invoices_status_idx` (tenantId, status)
    - `fin_invoices_number_idx` (tenantId, number)
    - `fin_invoice_lines_invoice_idx` (invoiceId)
    - `fin_invoice_reminders_tenant_idx` (tenantId)
    - `fin_invoice_reminders_invoice_idx` (invoiceId)
- [ ] `server/db/schema/index.ts` adaugă `export * from "./finInvoices"`
- [ ] Migrare `drizzle/0117_fin_invoices.sql`:
  - Prefix 0117 (> 0116 care este max pe main)
  - Creează enums `fin_invoice_status`
  - Creează tabelele în ordinea corectă (fin_invoices → fin_invoice_lines → fin_invoice_reminders)
  - `--> statement-breakpoint` între fiecare statement SQL separat
  - Nu modifică tabelul `invoices` existent
- [ ] `drizzle/meta/_journal.json` adaugă intrarea idx 117, tag `0117_fin_invoices`
- [ ] Seed în `scripts/seed.ts`: 2 facturi demo B2B cu câte 2 linii fiecare (cu TVA 20%),
  legate de partenerii demo din PARTY-001, idempotent (guard `if finInvoices is empty`)
- [ ] `npm run db:reset && npm run db:seed` reușesc fără eroare

## Files

**New:**
- `server/db/schema/finInvoices.ts` — schema fin_invoices + fin_invoice_lines + fin_invoice_reminders
- `drizzle/0117_fin_invoices.sql` — migrare manuală cu statement-breakpoints
- `src/__tests__/fin/bill-001-schema.test.ts` — teste unit pe schema

**Modified:**
- `server/db/schema/index.ts` — adaugă `export * from "./finInvoices"`
- `scripts/seed.ts` — seed 2 facturi B2B demo
- `drizzle/meta/_journal.json` — adaugă intrarea idx 117

## Tests

- **T-BILL-001-1** [blocant] `finInvoices`, `finInvoiceLines`, `finInvoiceReminders` exportate din `schema/index.ts`
- **T-BILL-001-2** [blocant] `fin_invoice_status` enum acceptă `draft`, `issued`, `paid`, `overdue`, `cancelled`
- **T-BILL-001-3** [blocant] `finInvoiceLines.vatPct` definit cu NOT NULL (TVA obligatoriu per linie — regula #1)
- **T-BILL-001-4** [blocant] Fișierul `drizzle/0117_fin_invoices.sql` există și conține `CREATE TABLE fin_invoices`
- **T-BILL-001-5** [blocant] Migrarea 0117 NU conține `CREATE TABLE invoices` sau `ALTER TABLE invoices` (separare B2B/B2C)
- **T-BILL-001-6** [normal] `finInvoiceReminders` are unique constraint pe `(invoiceId, reminderDay)`
- **T-BILL-001-7** [normal] `finInvoices.agreementId` este nullable (suportă facturare ad-hoc)

## DoD

- Schema compilează TypeScript strict, zero any
- Migrare 0117 corectă cu statement-breakpoints, nu atinge tabelul `invoices`
- `server/db/schema/index.ts` conține exportul finInvoices
- check-undefined-refs + check-route-mounts verzi
- Toate testele T1-T5 (blocant) verzi
