---
id: BUDGET-001
title: "Buget — schema fin_budgets + fin_budget_lines + migrare + seed"
milestone: FIN
phase: "20"
status: pending
depends_on: [CORE-001]
spec: backlog/specs/BUDGET-001.md
branch: feat/FIN-budget
---

## Goal

Schema Drizzle pentru modulul Buget FinDesk (GAP-ANALYSIS G4):
- `fin_budgets` — antet buget: an fiscal, departament, status (draft/active/closed).
- `fin_budget_lines` — linii buget: categorie cheltuială, sumă bugetată per linie.
- Migrare SQL corectă (statement-breakpoints, prefix unic față de main).
- Seed: 1 buget demo cu 5 linii (rent/utilities/salaries/marketing/supplies).

---

## User stories

- Ca **director financiar**, vreau să definesc un buget anual per departament, pentru că trebuie să aprob cheltuielile în limita alocată.
- Ca **contabil**, vreau să văd liniile de buget per categorie, pentru că reconciliez cheltuielile reale cu planul.
- Ca **manager de filială**, vreau un buget propriu al filialei mele, pentru că nu vreau să depind de bugetul central.
- Ca **director**, vreau să clonez bugetul anului trecut ca punct de plecare, pentru că structura de categorii se repetă.

---

## Acceptance criteria

- [ ] AC1: `server/db/schema/finBudgets.ts` creată cu:
  - `fin_budgets`: id, tenant_id (FK tenants), name, fiscal_year (int), department (varchar nullable), branch_id (uuid nullable, soft — no FK), status enum (draft/active/closed), notes, created_by (FK users), created_at, updated_at.
  - `fin_budget_lines`: id, tenant_id, budget_id (FK fin_budgets cascade delete), category (varchar 50 — mapează pe fin_expense_category sau alt string), label (varchar 200), budgeted_cents (bigint), display_order (int default 0), created_at.
  - Indexuri: tenant_id, budget_id pe linii.

- [ ] AC2: Export adăugat în `server/db/schema/index.ts` în ACELAȘI commit (schema-index rule §3.5.1).

- [ ] AC3: Migrare `drizzle/XXXX_fin_budgets.sql`:
  - Prefix unic față de main și față de celelalte branch-uri (folosim idx 117 dacă liber față de main).
  - Statement-breakpoints între instrucțiunile SQL.
  - `meta/_journal.json` actualizat (idx unic, tag corect).

- [ ] AC4: Seed în `server/db/seed.ts` (sau fișier seed dedicat): 1 buget demo cu 5 linii pentru tenantul demo.

- [ ] AC5: Zero `any`. Tipuri exportate: `FinBudget`, `FinBudgetLine`, `InsertFinBudget`, `InsertFinBudgetLine`.

---

## Files to create / modify

**Create:**
- `server/db/schema/finBudgets.ts`
- `drizzle/XXXX_fin_budgets.sql`
- `drizzle/meta/XXXX_snapshot.json` (sau actualizat cu idx corect)
- `src/__tests__/fin/budget-001.test.ts`

**Modify:**
- `server/db/schema/index.ts` — adaugă `export * from "./finBudgets";`
- `drizzle/meta/_journal.json` — adaugă entry cu idx unic
- `server/db/seed.ts` (sau echivalent) — seed buget demo

---

## Tests

- **T-BUDGET-001-1** `[blocant]` Given schema finBudgets importată, Then finBudgets și finBudgetLines sunt obiecte valide Drizzle (nu undefined).
- **T-BUDGET-001-2** `[blocant]` Given migration SQL, When check-migration-breakpoints, Then zero erori.
- **T-BUDGET-001-3** `[blocant]` Given schema finBudgets și schema finBudgets din migrare, When schema-drift check, Then zero divergențe.
- **T-BUDGET-001-4** [normal] Given fin_budget_lines cu budgeted_cents bigint, Then valoarea e reprezentată fără pierdere de precizie.
- **T-BUDGET-001-5** [normal] Given seed rulat, Then cel puțin 1 buget și 5 linii există în DB demo.

---

## Definition of Done

- [ ] AC1–AC5 implementate
- [ ] T1–T3 [blocante] trec
- [ ] `export * from "./finBudgets"` în index.ts
- [ ] Migrare prefix unic, breakpoints corecte, journal actualizat
- [ ] Build + typecheck verzi
- [ ] Static guards (check-migration-breakpoints, check-route-mounts, check-undefined-refs) verzi
