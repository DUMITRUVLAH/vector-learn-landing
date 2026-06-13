---
id: REGISTRY-001
title: "Schema fin_tax_rates + fin_chart_of_accounts + migrare 0117 + seed MD/RO 2026"
milestone: FIN
phase: "REGISTRY"
status: pending
attempts: 0
depends_on: [CORE-001]
spec: backlog/specs/REGISTRY-001-tax-rates-chart.md
core: backlog/fin/FIN-CORE.md
---

## Goal

Nomenclatoare fiscale pentru FinDesk: cote de taxare (TVA, impozit pe venit, contribuții sociale)
versionate după `effective_from`, și plan de conturi contabile (account chart) per țară.
Aceste tabele sunt sursa de adevăr pentru calculele de TVA (FISC), salarii (PAY), cheltuieli (SPEND).

Branch: `feat/FIN-registry` (faza REGISTRY, separat de feat/FIN-core).
Migrare: 0117 (prefix următor după 0116_fin_core.sql).

## User stories

- **Ca** contabil, **vreau** cotele de TVA automat selectate după țara firmei și data facturii, **pentru că** nu vreau să le tastez manual la fiecare document.
- **Ca** owner, **vreau** un plan de conturi Romanian/Moldovan pre-completat, **pentru că** altfel trebuie să-l introduc de la zero.
- **Ca** sistem, **vreau** cote versionate pe `effective_from`, **pentru că** cotele se schimbă (ex: TVA MD a variat).

## Acceptance criteria

- [ ] Tabelul `fin_tax_rates` — coloane: `id uuid PK`, `tenantId`, `country char(2)`, `kind` (`vat|income_tax|social_contribution|dividend_tax|other`), `name text`, `ratePct numeric(6,4)`, `effectiveFrom date NOT NULL`, `effectiveTo date`, `isDefault bool`, `notes text`, `createdAt`, `updatedAt`
- [ ] Tabelul `fin_chart_of_accounts` — coloane: `id uuid PK`, `tenantId`, `country char(2)`, `accountCode text NOT NULL`, `accountName text NOT NULL`, `accountType` (`asset|liability|equity|revenue|expense|cost_of_goods|tax`), `parentCode text`, `isActive bool DEFAULT true`, `createdAt`, `updatedAt`
- [ ] Indecși: `fin_tax_rates_tenant_country_idx(tenantId, country)`, `fin_chart_tenant_country_idx(tenantId, country)`, unic `(tenantId, accountCode)` pe fin_chart_of_accounts
- [ ] Migrare 0117 SQL scrisă manual (nu `db:generate` — prea multe coliziuni cu ramuri paralele), atașată la `_journal.json`
- [ ] Seed MD 2026 și RO 2025-2026 (TVA standard + reduse + scutit, impozit venit, contribuții sociale) rulat în `server/db/seed.ts` sau `seed-fin.ts`
- [ ] Helper `rateAt(tenantId, country, kind, date)` → returnează cota activă la data respectivă
- [ ] `server/db/schema/finRegistry.ts` exportat în `server/db/schema/index.ts`
- [ ] `schema-drift.test.ts` trece (codul include `fin_tax_rates` + `fin_chart_of_accounts`)
- [ ] `check-undefined-refs.mjs` + `check-route-mounts.mjs` rămân verzi

## Files

**New:**
- `server/db/schema/finRegistry.ts` — tabele + enums fin_tax_rates, fin_chart_of_accounts
- `drizzle/0117_fin_registry.sql` — migrare SQL
- `drizzle/meta/0117_snapshot.json` — snapshot minimal (copie de la 0116 + tabele noi)
- `server/lib/finRegistry.ts` — helper `rateAt()` + seed data (rate MD/RO)
- `src/__tests__/fin/registry-001-rates.test.ts` — unit tests rateAt + seed

**Modified:**
- `server/db/schema/index.ts` — `export * from "./finRegistry";`
- `drizzle/meta/_journal.json` — adaugă entry 0117
- `server/db/seed.ts` (sau nou `scripts/seed-fin-registry.ts`) — seed rate MD/RO

## Tests

- **T-REGISTRY-001-1** [blocant] After 0117 migration runs in PGlite, `fin_tax_rates` and `fin_chart_of_accounts` tables exist
- **T-REGISTRY-001-2** [blocant] `rateAt("tenant", "MD", "vat", new Date("2026-01-01"))` returns 20 (MD standard TVA rate)
- **T-REGISTRY-001-3** [blocant] `rateAt("tenant", "RO", "vat", new Date("2026-01-01"))` returns 19 (RO standard TVA rate)
- **T-REGISTRY-001-4** [blocant] Unique constraint: inserting duplicate `(tenantId, accountCode)` throws
- **T-REGISTRY-001-5** [blocant] `schema-drift.test.ts` passes — schema declares fin_tax_rates and fin_chart_of_accounts columns matching migration
- **T-REGISTRY-001-6** [normal] Seed data: at least 5 MD rate rows and 5 RO rate rows exist in seeded DB
- **T-REGISTRY-001-7** [normal] `rateAt()` returns null for unknown country/kind, not throwing

## Seed data — MD 2026

| kind | name | ratePct | effectiveFrom |
|------|------|---------|---------------|
| vat | TVA standard | 20.0000 | 2024-01-01 |
| vat | TVA redusă 8% | 8.0000 | 2024-01-01 |
| vat | TVA redusă 12% | 12.0000 | 2024-01-01 |
| vat | TVA zero | 0.0000 | 2024-01-01 |
| income_tax | Impozit pe venit | 12.0000 | 2024-01-01 |
| social_contribution | CNAS (angajator) | 24.0000 | 2024-01-01 |
| social_contribution | CNAM (angajator) | 4.5000 | 2024-01-01 |
| social_contribution | CNAS (angajat) | 6.0000 | 2024-01-01 |

## Seed data — RO 2025/2026

| kind | name | ratePct | effectiveFrom |
|------|------|---------|---------------|
| vat | TVA standard | 19.0000 | 2024-01-01 |
| vat | TVA redusă 9% | 9.0000 | 2024-01-01 |
| vat | TVA redusă 5% | 5.0000 | 2024-01-01 |
| vat | TVA zero | 0.0000 | 2024-01-01 |
| income_tax | Impozit venit microîntreprindere 1% | 1.0000 | 2024-01-01 |
| income_tax | Impozit venit microîntreprindere 3% | 3.0000 | 2024-01-01 |
| social_contribution | CAS (angajator) | 0.0000 | 2024-01-01 |
| social_contribution | CAS (angajat) | 25.0000 | 2024-01-01 |
| social_contribution | CASS (angajat) | 10.0000 | 2024-01-01 |

## DoD

- Migration 0117 in journal, db:reset+db:seed pass, schema-drift green
- Unit tests pass (rateAt + seed)
- check-undefined-refs + check-route-mounts green (no new routes — data only phase)
- Reviewer APPROVED; integration-architect CONNECTED
- Persona reports saved
- PR `feat/FIN-registry` open on main
