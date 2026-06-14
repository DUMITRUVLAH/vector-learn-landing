---
id: INSIGHT-001
title: "Schema fin_saved_views + fin_narratives + migrare 0115 + seed"
milestone: FIN
phase: "13"
status: pending
depends_on: [CORE-001]
spec: backlog/specs/INSIGHT-001.md
branch: feat/FIN-insight
---

## Goal

Creează fundația modulului FinDesk Insights (FIN-CORE §1.13):
1. Schema DB: `fin_saved_views` — vederi salvate per tenant/user pentru dashboard financiar
   (metrice, interval, grupare, filtre). Similare `saved_views` CRM-119 dar pentru contextul
   financiar (venituri, cheltuieli, profit, TVA, cashflow).
2. Schema DB: `fin_narratives` — narativele textuale generate AI sau manual (comentarii lunare
   ale directorului: „Ianuarie a fost bun pentru că..."). Principiul FIN-CORE: calculele sunt
   DETERMINISTE, narativele pot fi AI-generate sau manuale.
3. Migrare 0115_fin_insight_schema.sql (prefixul 0115 e cel disponibil pe acest branch,
   coliziunea cu feat/FIN-asset va fi renumerotată la merge).
4. Seed date de test: 2 vederi salvate demo + 1 narativă demo pentru tenant test.
5. Schema exportată în server/db/schema/index.ts (schema-index rule §3.5.1).

FIN-CORE §1.13 — FinDesk Insights:
- `fin_saved_views`: views salvate cu: name, metric (revenue|expenses|profit|vat|cashflow),
  period (this_month|last_month|last_3m|last_6m|ytd|custom), groupBy (day|week|month|category),
  filters (JSONB: account_type?, category?, tenant_id?), is_default, is_public.
- `fin_narratives`: month (YYYY-MM), title, body (markdown), generated_by (manual|ai),
  sentiment (positive|neutral|negative), published_at, author_id.

---

## User stories

- Ca **director financiar**, vreau să salvez o combinație de filtre pentru raportul lunii
  (ex. „Cheltuieli IT Q4"), pentru că îl regenerez frecvent și nu vreau să setez filtrele manual.
- Ca **director**, vreau să scriu un comentariu lunar al performanței (narativă) atașat lunii,
  pentru că raportul de board are nevoie de context, nu doar cifre.
- Ca **auditor**, vreau să văd istoricul narativelor lunare, pentru că urmăresc evoluția și
  deciziile pe termen lung.

---

## Acceptance criteria

- [ ] AC1: Tabelă `fin_saved_views` cu coloane:
  id (uuid PK), tenant_id (FK tenants cascade delete), user_id (FK users cascade delete),
  name (varchar 200 NOT NULL), metric (enum: revenue|expenses|profit|vat|cashflow NOT NULL),
  period (enum: this_month|last_month|last_3m|last_6m|ytd|custom NOT NULL default this_month),
  group_by (enum: day|week|month|category NOT NULL default month),
  filters (jsonb default '{}'),
  is_default (boolean default false — max 1 per user per metric),
  is_public (boolean default false — vizibil altor useri din tenant),
  created_at, updated_at.
  Index: (tenant_id), (user_id).
- [ ] AC2: Tabelă `fin_narratives` cu coloane:
  id (uuid PK), tenant_id (FK tenants cascade delete), author_id (FK users cascade delete nullable),
  month (varchar 7 YYYY-MM NOT NULL), title (varchar 300 NOT NULL),
  body (text NOT NULL — markdown), generated_by (enum: manual|ai NOT NULL default manual),
  sentiment (enum: positive|neutral|negative default neutral),
  published_at (timestamp nullable — null = draft),
  created_at, updated_at.
  Index unic: (tenant_id, month) — o singură narativă publishată per lună (UPSERT semantics OK).
- [ ] AC3: Migrare 0115_fin_insight_schema.sql cu statement-breakpoints corecte (§3.5.1).
  `npm run db:reset && npm run db:seed` trece cu migrarea inclusă (nota: coliziune de prefix cu
  feat/FIN-asset așteptată — se renumerotează la merge).
- [ ] AC4: server/db/schema/finInsight.ts exportat în server/db/schema/index.ts.
- [ ] AC5: Drizzle relations: finSavedViews → users (many-to-one), finSavedViews → tenants,
  finNarratives → users (many-to-one, nullable author), finNarratives → tenants.
- [ ] AC6: Seed în server/db/seed.ts — adaugă 2 vederi salvate demo + 1 narativă publicată
  pentru tenant demo:
  { name: "Venituri luna curentă", metric: "revenue", period: "this_month", groupBy: "day", isDefault: true },
  { name: "Cheltuieli Q4 IT", metric: "expenses", period: "last_3m", groupBy: "category", filters: { category: "IT" } },
  { name: "Narativă Jan 2026", month: "2026-01", title: "Performanță Ianuarie 2026",
    body: "**Ianuarie** a depășit targetul cu 12%...", generatedBy: "manual", sentiment: "positive",
    publishedAt: "2026-02-01" }.
- [ ] AC7: TypeScript types exportate: FinSavedView, InsertFinSavedView, FinNarrative, InsertFinNarrative.
- [ ] AC8: Zero `any`, tenant isolation (toate coloanele tenant_id prezente).

---

## Files to create / modify

**Create:**
- `server/db/schema/finInsight.ts` — schema fin_saved_views + fin_narratives + types + relations
- `drizzle/0115_fin_insight_schema.sql` — migrare manuală (hand-write, §3.5.1)
- `src/__tests__/fin/fin-insight-schema.test.ts` — test existență migrare + schema + exports

**Modify:**
- `server/db/schema/index.ts` — `export * from "./finInsight";`
- `drizzle/meta/_journal.json` — append entry idx 115, tag "0115_fin_insight_schema"
- `server/db/seed.ts` — adaugă seed fin_saved_views + fin_narratives demo

---

## Tests

- **T-INSIGHT-001-1** `[blocant]` Migration discipline: `drizzle/0115_fin_insight_schema.sql` există
  și conține `CREATE TABLE "fin_saved_views"` și `CREATE TABLE "fin_narratives"`.
- **T-INSIGHT-001-2** `[blocant]` `_journal.json` conține entry cu idx=115 și tag="0115_fin_insight_schema".
- **T-INSIGHT-001-3** `[blocant]` Schema: `finSavedViews` și `finNarratives` exportate din
  `server/db/schema/index.ts` (nu undefined).
- **T-INSIGHT-001-4** [normal] finSavedViews are coloanele: id, tenant_id, user_id, name,
  metric, period, group_by, filters, is_default, is_public.
- **T-INSIGHT-001-5** [normal] finNarratives are coloanele: id, tenant_id, author_id, month,
  title, body, generated_by, sentiment, published_at.

---

## Definition of Done

- [ ] AC1-AC8 implementate
- [ ] T-INSIGHT-001-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/db/schema/index.ts include export finInsight
- [ ] _journal.json are idx 115 fără duplicate (pe acest branch)
