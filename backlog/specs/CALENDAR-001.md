---
id: CALENDAR-001
title: "Schema fin_obligations + fin_period_locks + migrare 0115 + seed"
milestone: FIN
phase: "14"
status: pending
depends_on: [FISC-001]
spec: backlog/specs/CALENDAR-001.md
branch: feat/FIN-calendar
---

## Goal

Creează infrastructura de date pentru modulul FinDesk Calendar Fiscal (FIN-CORE §1.14):

1. **`fin_obligations`** — obligații fiscale și de plată ale tenantului, cu termen, tip și status
   (TVA-MD, impozit venit-MD, CAS angajat/angajator, CNAM, salariu, TVA-RO, D394-RO etc.).
   Fiecare obligație are o `due_date`, `amount_cents` (estimat/calculat), `status` (pending/paid/overdue),
   legătură opțională cu `fin_tax_declarations` sau `fin_payroll_runs`.
2. **`fin_period_locks`** — blocarea perioadelor contabile (FIN-CORE regula #8): după ce un director
   financiar închide o perioadă (lună/trimestru), nicio postare contabilă nu mai poate fi modificată
   retroactiv în acea perioadă. Imutabilitate garantată de DB.
3. Migrare `0115_fin_calendar.sql` cu statement-breakpoints corecte (> max 0114 pe main).
4. Seed: 3 obligații demo pentru tenant test + 1 perioadă blocată demo.

Calculele sunt DETERMINISTE în cod — AI nu calculează impozite (FIN-CORE regula #4).
Banii în cenți (FIN-CORE regula #10). Tenant isolation obligatorie.

---

## User stories

- Ca **contabil**, vreau să văd toate obligațiile fiscale și de plată ale lunii curente cu termene
  clare, pentru că fiecare obligație ratată atrage penalități.
- Ca **director financiar**, vreau să blochez o perioadă contabilă după ce am reconciliat-o,
  pentru că nu vreau modificări retroactive care să destabilizeze rapoartele.
- Ca **contabil**, vreau să filtrez obligațiile după tip (TVA, CAS, salariu) și status
  (pending/paid/overdue), pentru că am nevoie să prioritizez ce plătesc azi.
- Ca **administrator**, vreau ca schema să fie multi-tenant și izolată, pentru că datele fiscale
  ale unui client nu trebuie să fie vizibile altui client.

---

## Acceptance criteria

- [ ] AC1: Tabelul `fin_obligations` creat cu coloanele:
  `id UUID PK`, `tenant_id UUID FK→tenants CASCADE`,
  `obligation_type VARCHAR(50) NOT NULL` (enum ca check constraint sau validare în cod:
  `tva_md|tva_ro|income_tax_md|income_tax_ro|cas_employee|cas_employer|cnam|salary|custom`),
  `description VARCHAR(500)`,
  `period_year INTEGER NOT NULL`, `period_month INTEGER NOT NULL` (1–12),
  `due_date DATE NOT NULL`,
  `amount_cents BIGINT NOT NULL DEFAULT 0` (estimat; actualizat la calcul),
  `currency CHAR(3) NOT NULL DEFAULT 'MDL'`,
  `status VARCHAR(20) NOT NULL DEFAULT 'pending'` (pending|paid|overdue),
  `paid_at TIMESTAMP nullable`,
  `declaration_id UUID nullable FK→fin_tax_periods (loose — nu CASCADE, NULL OK)`,
  `notes TEXT nullable`,
  `created_at TIMESTAMP NOT NULL DEFAULT now()`, `updated_at TIMESTAMP NOT NULL DEFAULT now()`.
  Index: `fob_tenant_idx (tenant_id)`, `fob_tenant_year_month_idx (tenant_id, period_year, period_month)`,
  `fob_due_date_idx (due_date)`.

- [ ] AC2: Tabelul `fin_period_locks` creat cu coloanele:
  `id UUID PK`, `tenant_id UUID FK→tenants CASCADE`,
  `period_year INTEGER NOT NULL`, `period_month INTEGER NOT NULL`,
  `locked_at TIMESTAMP NOT NULL DEFAULT now()`,
  `locked_by UUID FK→users ON DELETE SET NULL`,
  `notes TEXT nullable`.
  Constraint UNIQUE: `(tenant_id, period_year, period_month)` — o singură perioadă blocată per lună.
  Index: `fpl_tenant_idx (tenant_id)`.

- [ ] AC3: Migrare `drizzle/0115_fin_calendar.sql` cu statement-breakpoints corecte (§3.5.1).
  Nu conține enum-uri Postgres native (folosim VARCHAR + check sau validare cod) pentru portabilitate
  PGlite. `npm run db:reset && npm run db:seed` trece cu migrarea inclusă.

- [ ] AC4: `server/db/schema/finCalendar.ts` exportat în `server/db/schema/index.ts`:
  `export * from "./finCalendar";` adăugat la finalul fișierului.

- [ ] AC5: Drizzle relations declarate:
  `finObligations → tenants (many-to-one)`,
  `finPeriodLocks → tenants (many-to-one)`,
  `finPeriodLocks → users (many-to-one, locked_by)`.

- [ ] AC6: Seed în `server/db/seed.ts` — adaugă pentru tenant demo:
  - Obligație 1: `{ type: 'tva_md', description: 'TVA lunar Ianuarie 2026', period_year: 2026, period_month: 1, due_date: '2026-02-25', amount_cents: 0, currency: 'MDL', status: 'pending' }`
  - Obligație 2: `{ type: 'cas_employer', description: 'CAS angajator Ianuarie 2026', period_year: 2026, period_month: 1, due_date: '2026-02-25', amount_cents: 0, currency: 'MDL', status: 'pending' }`
  - Obligație 3: `{ type: 'salary', description: 'Salarii Ianuarie 2026', period_year: 2026, period_month: 1, due_date: '2026-01-31', amount_cents: 250000, currency: 'MDL', status: 'paid', paid_at: '2026-01-31T10:00:00Z' }`
  - Lock: `{ period_year: 2025, period_month: 12, notes: 'Decembrie 2025 reconciliat și blocat' }`

- [ ] AC7: TypeScript types exportate: `FinObligation`, `InsertFinObligation`, `FinPeriodLock`, `InsertFinPeriodLock`.

- [ ] AC8: Zero `any`. Tenant isolation — toate query-urile filtrează după `tenant_id`.

---

## Files to create / modify

**Create:**
- `server/db/schema/finCalendar.ts` — schema Drizzle fin_obligations + fin_period_locks + types + relations
- `drizzle/0115_fin_calendar.sql` — migrare manuală hand-written cu statement-breakpoints
- `drizzle/meta/0115_snapshot.json` — snapshot minimal (structura standard)
- `src/__tests__/fin/fin-calendar-schema.test.ts` — test existență migrare + schema + exports

**Modify:**
- `server/db/schema/index.ts` — adaugă `export * from "./finCalendar";` la final
- `drizzle/meta/_journal.json` — adaugă entry `{ idx: 115, version: "7", when: <ts>, tag: "0115_fin_calendar" }`
- `server/db/seed.ts` — adaugă seed fin_obligations + fin_period_locks

---

## Tests

- **T-CALENDAR-001-1** `[blocant]` Migration discipline: `drizzle/0115_fin_calendar.sql` există
  și conține `CREATE TABLE "fin_obligations"` și `CREATE TABLE "fin_period_locks"`.
- **T-CALENDAR-001-2** `[blocant]` `_journal.json` conține entry cu idx=115 și tag care include "fin_calendar".
- **T-CALENDAR-001-3** `[blocant]` Schema: `finObligations` și `finPeriodLocks` exportate din
  `server/db/schema/index.ts` (nu undefined).
- **T-CALENDAR-001-4** [normal] `finObligations` are coloanele: id, tenant_id, obligation_type,
  description, period_year, period_month, due_date, amount_cents, currency, status, paid_at.
- **T-CALENDAR-001-5** [normal] `finPeriodLocks` are coloanele: id, tenant_id, period_year,
  period_month, locked_at, locked_by, notes.
- **T-CALENDAR-001-6** [normal] DB reset + seed reușesc fără erori (integrare locală).

---

## Definition of Done

- [ ] AC1–AC8 implementate
- [ ] T-CALENDAR-001-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/db/schema/index.ts include export finCalendar
- [ ] _journal.json are idx 115 fără duplicate (pe acest branch — coliziune cu alte ramuri așteptată la merge, se renumerotează atunci)
