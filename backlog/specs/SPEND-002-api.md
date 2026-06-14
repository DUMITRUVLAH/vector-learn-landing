---
id: SPEND-002
title: "API cheltuieli — categorii, TVA deductibil obligatoriu, status, source"
milestone: FIN
phase: spend
branch: feat/FIN-spend
depends_on: [SPEND-001]
spec: backlog/specs/SPEND-002-api.md
status: pending
attempts: 0
blockers: []
---

## Goal

Construiește API REST pentru modulul Cheltuieli pe `feat/FIN-spend`.

**Routes (montate la /api/fin):**
```
GET    /api/fin/expenses            — lista paginată (filter: category, status, source, dateFrom, dateTo)
POST   /api/fin/expenses            — creare cheltuială (vat_deductible OBLIGATORIU în body)
GET    /api/fin/expenses/:id        — detaliu
PUT    /api/fin/expenses/:id        — actualizare (doar draft/rejected)
DELETE /api/fin/expenses/:id        — soft-delete (status→rejected, nu ștergere fizică)
POST   /api/fin/expenses/:id/approve — aprobă cheltuiala (rol director/manager)
GET    /api/fin/expenses/categories — lista categorii enum cu etichete RO
GET    /api/fin/expenses/summary    — totale pe categorie + TVA deductibil total (luna curentă sau range)
```

**Regula #1 (FIN-CORE):** `vat_deductible` este OBLIGATORIU la creare. Dacă lipsește → 400 "vat_deductible_required".

**Tenant safety:** toate rutele filtrează strict după `user.tenantId`. Fără cross-tenant leak.

**Montare în app.ts:** `app.route("/api/fin", finExpensesRoutes)` — ÎNAINTE de orice rută generică `/api/fin`.

## User stories

- Ca director, vreau să listez cheltuielile pe categorie și perioadă, pentru că raportez lunar costurile.
- Ca contabil, vreau să creez o cheltuială cu TVA deductibil explicit, pentru că e obligatoriu fiscal.
- Ca director, vreau să aprob cheltuielile înregistrate de staff, pentru că am nevoie de control al cheltuielilor.
- Ca director, vreau un sumar pe categorii cu TVA deductibil total, pentru că reduc povara fiscală.

## Acceptance criteria

- [ ] GET /api/fin/expenses returnează lista cu filtre funcționale (category, status, dateFrom, dateTo)
- [ ] POST /api/fin/expenses fără `vat_deductible` → 400 "vat_deductible_required"
- [ ] POST /api/fin/expenses cu date corecte → 201 + cheltuiala creată
- [ ] PUT /api/fin/expenses/:id actualizează doar cheltuielile proprii tenantului și în status draft/rejected
- [ ] POST /api/fin/expenses/:id/approve schimbă status în `approved`, setează approved_by + approved_at
- [ ] GET /api/fin/expenses/summary returnează totale per categorie + vat_deductible_total
- [ ] GET /api/fin/expenses/categories returnează array [{value, label}] cu etichete românești
- [ ] Toate rutele returnează 401 fără token valid
- [ ] finExpensesRoutes montat în server/app.ts
- [ ] Zero `any`, TypeScript strict
- [ ] Nicio rută nu folosește raw .execute().rows (portability)

## Files

### New
- `server/routes/finExpenses.ts` — router Hono
- `server/routes/__tests__/finExpenses.test.ts` — teste API

### Modified
- `server/app.ts` — montează `finExpensesRoutes` la `/api/fin`
- `src/lib/api/finExpenses.ts` — funcții frontend (listExpenses, createExpense, approveExpense, getSummary)

## Tests

- **T-SPEND-002-1** [blocant] Given POST /api/fin/expenses fără vat_deductible, When se apelează, Then 400 "vat_deductible_required"
- **T-SPEND-002-2** [blocant] Given login + POST /api/fin/expenses cu date valide, When se apelează, Then 201 cu cheltuiala creată
- **T-SPEND-002-3** [blocant] Given GET /api/fin/expenses, When se apelează fără token, Then 401
- **T-SPEND-002-4** [normal] Given cheltuială aprobată, When POST /api/fin/expenses/:id/approve, Then status=approved + approved_by setat
- **T-SPEND-002-5** [normal] Given GET /api/fin/expenses/summary, When se apelează, Then returnează { byCategory: [...], vatDeductibleTotal: number }
- **T-SPEND-002-6** [blocant] Given finExpensesRoutes, When se verifică server/app.ts, Then `app.route("/api/fin", finExpensesRoutes)` există (route-mount check)

## DoD

- Build + typecheck + lint verzi
- Toate testele [blocant] trec
- Route montat în app.ts (verificat de check-route-mounts)
- Niciun raw .execute().rows
- Reviewer APPROVED + integration-architect CONNECTED
