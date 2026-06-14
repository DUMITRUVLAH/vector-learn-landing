---
id: INSIGHT-002
title: "API metrici venituri/cheltuieli/profit/TVA/aging + cashflow forecast 60z 3 scenarii"
milestone: FIN
phase: "13"
status: pending
depends_on: [INSIGHT-001]
spec: backlog/specs/INSIGHT-002.md
branch: feat/FIN-insight
---

## Goal

Implementează API-ul de metrici financiare FinDesk Insights (FIN-CORE §1.13):

1. **GET /api/analytics/fin/metrics** — agregare venituri/cheltuieli/profit/TVA per perioadă,
   cu groupBy (day|week|month|category). Sursă date: `payments` (status=paid → revenue),
   `invoices` (status=issued → receivable), `students.debtCents` (aging receivable).
   Calculul: DETERMINIST (nu AI) — FIN-CORE regula #4.

2. **GET /api/analytics/fin/aging** — aging receivable per intervaluri standard:
   0-30z, 31-60z, 61-90z, 90+z. Sursă: `invoices` cu dueDate în trecut + status ≠ paid|cancelled.

3. **GET /api/analytics/fin/cashflow-forecast** — forecast cashflow pe 60 de zile (competitor parity),
   3 scenarii DETERMINISTE: Bun (+20%), Bază (tendință curentă), Slab (-20%).
   Calculul bazei: media veniturilor săptămânale din ultimele 12 săptămâni.
   Bun: baza × 1.2. Slab: baza × 0.8. Returnează array de 60 perechi (date, MDL).

4. **API client** `src/lib/api/finInsight.ts` — funcțiile: `getFinMetrics`, `getFinAging`,
   `getCashflowForecast`, `listSavedViews`, `createSavedView`, `listNarratives`, `upsertNarrative`.
   Refolosire `saved-views.ts` + `analytics.ts` server-side (nu reinventăm).

5. Rute adăugate în `analyticsRoutes` (refolosire mount existent `/api/analytics`),
   nu un router separat (evităm mount proliferare).

---

## User stories

- Ca **director financiar**, vreau să văd venituri/cheltuieli/profit per lună pe ultimele 6 luni,
  pentru că urmăresc tendința și o prezint în board.
- Ca **contabil**, vreau să văd aging receivable (facturile restante pe intervale 30/60/90+z),
  pentru că știu pe cine trebuie să contactez azi.
- Ca **director**, vreau să văd cashflow-ul forecasat pe 60 de zile (3 scenarii: Bun/Bază/Slab),
  pentru că deciziile de investiție depind de lichiditate.
- Ca **director**, vreau să salvez combinații de metrică+perioadă ca vederi (refolosesc din INSIGHT-001 fin_saved_views).

---

## Acceptance criteria

- [ ] AC1: `GET /api/analytics/fin/metrics?period=last_6m&groupBy=month` returnează:
  `{ metrics: [{ period: "2026-01", revenue: N, receivable: N, profit: N }] }`
  - `revenue` = sum payments.amountCents unde status='paid' + paidAt în interval
  - `receivable` = sum invoices.amountCents unde status='issued' + issueDate în interval
  - `profit` = revenue - (receivable ce a expirat) [aproximare simplă, DETERMINIST]
  Tenant isolation: filtrare prin tenantId. Suportă period: this_month, last_month, last_3m,
  last_6m, ytd. Suportă groupBy: month (default), day.
- [ ] AC2: `GET /api/analytics/fin/aging` returnează:
  ```json
  { "aging": { "0_30": N, "31_60": N, "61_90": N, "90_plus": N, "total": N } }
  ```
  Calculat din `invoices` cu dueDate < today + status IN ('issued', 'draft').
  Toate sumele în MDL (cenți).
- [ ] AC3: `GET /api/analytics/fin/cashflow-forecast` returnează:
  ```json
  {
    "scenarios": {
      "good": [{ "date": "2026-06-15", "cumulativeCents": N }],
      "base": [...],
      "pessimistic": [...]
    },
    "weeklyAvgCents": N,
    "generatedAt": "ISO timestamp"
  }
  ```
  60 de zile consecutive de azi. Baza = media săptămânală din ultimele 12 săptămâni din payments.
  Bun = baza × 1.2 / 7 per zi, Slab = baza × 0.8 / 7 per zi, Bază = baza / 7 per zi.
  Cumulativ: ziua N = sum zilelor 1..N. DETERMINIST.
- [ ] AC4: `GET /api/analytics/fin/saved-views` și `POST /api/analytics/fin/saved-views` —
  lista și creare vederi salvate (refolosire tabela fin_saved_views din INSIGHT-001).
- [ ] AC5: `GET /api/analytics/fin/narratives?year=2026` și
  `PUT /api/analytics/fin/narratives/:month` — lista narativele anului + upsert narativă
  (refolosire tabela fin_narratives din INSIGHT-001).
- [ ] AC6: `src/lib/api/finInsight.ts` — client API tipizat cu funcțiile:
  `getFinMetrics(params)`, `getFinAging()`, `getCashflowForecast()`,
  `listSavedViews()`, `createSavedView(data)`, `listNarratives(year)`, `upsertNarrative(month, data)`.
  Zero `any`.
- [ ] AC7: Rute adăugate în `server/routes/analytics.ts` (acelaşi fișier, același mount `/api/analytics`).
  Prefix intern: `/fin/metrics`, `/fin/aging`, `/fin/cashflow-forecast`,
  `/fin/saved-views`, `/fin/narratives/:month`.
- [ ] AC8: Tenant isolation pe toate rutele. DETERMINIST — zero AI în calcule.
  Testele verifică formatul răspunsurilor.

---

## Files to create / modify

**Create:**
- `src/lib/api/finInsight.ts` — API client tipizat
- `src/__tests__/fin/fin-insight-api.test.ts` — teste API client + calcul cashflow

**Modify:**
- `server/routes/analytics.ts` — adaugă rute /fin/* la analyticsRoutes
- `server/db/schema/index.ts` — deja are finInsight (INSIGHT-001) — fără modificare necesară

---

## Tests

- **T-INSIGHT-002-1** `[blocant]` Given `getCashflowForecast()` cu fetch mock `{ scenarios: { base: [...60 items] }, weeklyAvgCents: 100000, generatedAt: "..." }`,
  When fetch mock 200, Then returnează array cu 60 perechi date+cents fără excepție.
- **T-INSIGHT-002-2** `[blocant]` Given cashflow base calcul cu weeklyAvg=700000 cenți,
  When calcul baza per zi=100000, good per zi=120000, slab per zi=80000,
  Then raportul good/base = 1.2 și slab/base = 0.8 (DETERMINIST, ±1 cent eroare de rotunjire).
- **T-INSIGHT-002-3** `[blocant]` Given `getFinMetrics({ period: 'last_6m', groupBy: 'month' })` cu fetch mock 200,
  Then returnează obiect cu `metrics` array și fiecare item are câmpurile: period, revenue, receivable.
- **T-INSIGHT-002-4** [normal] Given `getFinAging()` cu fetch mock `{ aging: { "0_30": 50000, "31_60": 30000, "61_90": 0, "90_plus": 10000, "total": 90000 } }`,
  When fetch 200, Then returnează obiect cu câmpurile 0_30, 31_60, 61_90, 90_plus, total.
- **T-INSIGHT-002-5** [normal] Given `listSavedViews()` cu fetch mock `{ views: [] }`,
  When fetch 200, Then returnează array gol fără excepție.
- **T-INSIGHT-002-6** [normal] Given `listNarratives(2026)` cu fetch mock `{ narratives: [] }`,
  When fetch 200, Then returnează array gol fără excepție.

---

## Definition of Done

- [ ] AC1-AC8 implementate
- [ ] T-INSIGHT-002-1..3 trec (blocante)
- [ ] Calcul cashflow DETERMINIST: weeklyAvg × 1.2/0.8/1.0 per zi, cumulativ pe 60 de zile
- [ ] Build + typecheck + lint verzi
- [ ] Rute adăugate în analytics.ts (mount existent, fără router nou)
- [ ] Zero `any`, tenant isolation pe toate rutele
