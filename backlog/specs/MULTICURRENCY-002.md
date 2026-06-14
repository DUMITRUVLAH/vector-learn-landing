---
id: MULTICURRENCY-002
title: Revaluare sold la închiderea lunii — diferențe de curs în LEDGER + UI
milestone: FIN
phase: multicurrency
status: pending
depends_on: [MULTICURRENCY-001]
spec: backlog/specs/MULTICURRENCY-002.md
---

## Goal

Implementează procesul de revaluare a soldurilor multivalutare la închiderea lunii:
compară cursul BNM de la sfârșitul lunii cu cursul de înregistrare inițial și postează
diferențele de curs (câștig/pierdere) în tabela `fin_ledger_entries` ca tip
`fx_revaluation`. Include un UI minimal în `/app/fin/revaluation` cu buton de declanșare
și lista ultimelor 5 revaluări.

## User stories

- Ca director financiar, vreau să inițiez revaluarea soldurilor la fin de lună, astfel
  încât bilanțul să reflecte valoarea corectă în MDL la cursul curent.
- Ca contabil, vreau să văd lista diferențelor de curs postate (câștig/pierdere pe pereche
  valutară), astfel încât să pot verifica corectitudinea și să pregătesc declarațiile.
- Ca sistem, vreau că revaluarea să fie idempotentă (re-rulare pe aceeași lună nu dublează
  înregistrările), astfel încât să nu apar discrepanțe dacă procesul e rulat de două ori.
- Ca auditor, vreau o pistă de audit pentru fiecare revaluare (cine a inițiat, când, ce
  sume), astfel încât să pot reconstitui istoricul.

## Acceptance criteria

- [ ] Tabela `fin_ledger_entries` cu coloanele: `id` (uuid PK), `tenant_id` (FK tenants),
  `entry_type` varchar(30) (e.g. `fx_revaluation`, `payment`, `invoice`), `currency_from`
  varchar(3), `currency_to` varchar(3), `amount_cents` bigint, `rate_used` numeric(18,6),
  `fx_gain_loss_cents` bigint, `reference_id` uuid nullable (FK la payments/invoices),
  `period_month` date (prima zi a lunii), `posted_by` uuid FK users, `posted_at` timestamptz,
  `note` text nullable.
- [ ] Schema `server/db/schema/finLedger.ts` exportă `finLedgerEntries`, tipuri.
- [ ] `server/db/schema/index.ts` are `export * from "./finLedger"`.
- [ ] Migrare `drizzle/0116_fin_ledger.sql` cu CREATE TABLE + statement-breakpoints.
- [ ] Serviciu `server/lib/fin/revaluation.ts` cu funcția:
  ```ts
  revaluateMonth(tenantId: string, periodMonth: Date, userId: string): Promise<RevaluationResult>
  ```
  - Preia toate plățile/facturile cu `currency != 'MDL'` din luna respectivă.
  - Găsește cursul BNM de la ultima zi a lunii din `fin_exchange_rates`.
  - Calculează diferența față de cursul la care a fost înregistrată tranzacția.
  - Inserează o înregistrare `fx_revaluation` în `fin_ledger_entries` per pereche valutară.
  - Dacă există deja o revaluare pentru `(tenant_id, period_month)` → upsert (nu duplica).
- [ ] Rute API:
  - `POST /api/fin/revaluation` cu body `{ period_month: "2026-05-01" }` → declanșează revaluarea, returnează `RevaluationResult`.
  - `GET  /api/fin/revaluation?limit=10` → lista ultimelor revaluări (group by period_month, sumar câștig/pierdere).
- [ ] Pagina UI `src/app/fin/RevaluationPage.tsx` la ruta `/app/fin/revaluation`:
  - Selector lună (month picker) + buton „Revaluează".
  - Tabel cu ultimele 5 revaluări: lună, câștig/pierdere total MDL, # tranzacții, inițiat de.
  - Loading state + tratarea erorilor.
  - Tokens Vector 365; funcționează dark + light mode; WCAG AA.
- [ ] Ruta montată în `server/app.ts` cu comentariul `// MULTICURRENCY-002`.
- [ ] TypeScript strict; zero `any`.

## Files

- `server/db/schema/finLedger.ts` — schema LEDGER
- `server/db/schema/index.ts` — adaugă export
- `drizzle/0116_fin_ledger.sql` — migrare SQL
- `drizzle/meta/0116_snapshot.json` — snapshot
- `drizzle/meta/_journal.json` — entry nouă
- `server/lib/fin/revaluation.ts` — serviciu calcul revaluare
- `server/routes/finRevaluation.ts` — rute API
- `server/app.ts` — mount rute
- `server/__tests__/finRevaluation.test.ts` — teste unitare
- `src/app/fin/RevaluationPage.tsx` — UI
- `src/lib/api/finRevaluation.ts` — client API frontend

## Tests

- **T-MULTI002-1** [blocant] Given: migrare 0116, When: `db:reset`, Then: `fin_ledger_entries` e creată cu toate coloanele.
- **T-MULTI002-2** [blocant] Given: server pornit + date seeded (plăți EUR din mai 2026 + curs BNM 31-mai), When: `POST /api/fin/revaluation` cu `{ period_month: "2026-05-01" }`, Then: 200 + `{ entries_created: N, total_fx_gain_loss_mdl_cents: X }`.
- **T-MULTI002-3** [blocant] Given: revaluare deja existentă pentru mai 2026, When: re-POST același `period_month`, Then: nu se creează duplicate (N rămâne același, upsert).
- **T-MULTI002-4** [blocant] Given: server pornit + auth valid, When: `GET /api/fin/revaluation?limit=5`, Then: 200 cu array de max 5 revaluări (câmpurile: period_month, total_fx_cents, entries_count).
- **T-MULTI002-5** [normal] Given: pagina `/app/fin/revaluation` randată, When: render fără crash, Then: titlul „Revaluare sold" e vizibil + buton „Revaluează" e prezent.
- **T-MULTI002-6** [normal] Given: calcul revaluare cu rată mai mare decât rata inițială, When: `revaluateMonth(...)`, Then: `fx_gain_loss_cents` > 0 (câștig din diferență de curs).

## DoD

- Migrări 0115+0116 commitată; `db:reset && db:seed` trece.
- Revaluare idempotentă verificată prin test.
- UI `/app/fin/revaluation` randează fără crash; dark mode OK.
- PR pe branch `feat/FIN-multicurrency` (același branch cu MULTICURRENCY-001).
