---
id: AGREEMENT-002
title: "API contracte + servicii: recurring/one_time, next_bill_date"
milestone: FIN
phase: "4"
status: in_progress
attempts: 1
depends_on: [AGREEMENT-001]
spec: backlog/specs/AGREEMENT-002.md
branch: feat/FIN-agreement
---

## Goal

Endpoints REST pentru gestionarea completă a contractelor (`fin_agreements`) și a
serviciilor/liniilor lor (`fin_agreement_services`). Include logica de calcul
`next_bill_date` la crearea unui serviciu recurent (avansează cu 1 lună/trimestru/an
din `startDate` sau azi). Routa se montează în `server/app.ts` sub `/api/fin/agreements`.

**Refolosire:** tiparul CRUD din `finPartiesRoutes` (PARTY-002) — nu re-implementăm
auth guard, pattern de error handling sau validare zod de la zero.

## User stories

- **Ca** contabil, **vreau** să listez toate contractele active ale unui tenant,
  **pentru că** vreau să văd ce obligații contractuale avem.
- **Ca** director, **vreau** să creez un contract nou legat de un partener,
  cu servicii recurente și one-time, **pentru că** vreau ca facturarea să fie automată.
- **Ca** sistem, **vreau** ca `next_bill_date` să fie calculat automat la salvarea
  unui serviciu recurent, **pentru că** motorul de billing (BILL-001) va folosi această dată.
- **Ca** contabil, **vreau** să editez sau să anulez un contract existent,
  **pentru că** termenii se pot schimba.

## Acceptance criteria

- [ ] `server/routes/finAgreements.ts` cu Hono router `finAgreementsRoutes`:
  - GET /api/fin/agreements — list (query: status, partyId, search, limit, offset)
  - GET /api/fin/agreements/:id — single sau 404
  - POST /api/fin/agreements — creare contract cu validare zod
  - PATCH /api/fin/agreements/:id — editare parțială (status, title, notes, currency, dates)
  - DELETE /api/fin/agreements/:id — soft delete (status → `cancelled`)
  - GET /api/fin/agreements/:id/services — lista serviciilor
  - POST /api/fin/agreements/:id/services — adaugă serviciu; calculează `next_bill_date`
  - PATCH /api/fin/agreements/:id/services/:serviceId — editare serviciu
  - DELETE /api/fin/agreements/:id/services/:serviceId — șterge serviciu (hard delete)
- [ ] Toate rutele auth-guard (requireAuth middleware)
- [ ] `server/app.ts` montează `finAgreementsRoutes` la `/api/fin/agreements`
  (ruta specifică `/:id/services` vine înaintea `/:id` în Hono — hono-specific-route-before-param)
- [ ] Răspunsuri JSON: `{ data: ... }` sau `{ data: [...], total: N }` pentru liste
- [ ] Calcul `next_bill_date` la POST serviciu recurent:
  - dacă `agreement.startDate` e în viitor → `next_bill_date = startDate`
  - altfel → avansează cu 1 perioadă din azi:
    - `monthly` → primul zi a lunii viitoare
    - `quarterly` → primul zi a trimestrului viitor
    - `yearly` → aceeași zi a anului viitor
- [ ] Validare zod: `unitPriceCents` ≥ 0; `quantity` ≥ 1; `vatPct` 0–100;
  `recurrencePeriod` obligatoriu când `billingType = recurring`

## Files

**New:**
- `server/routes/finAgreements.ts` — Hono router CRUD contracte + servicii
- `src/__tests__/fin/agreement-002-api.test.ts` — teste unit pe logica API

**Modified:**
- `server/app.ts` — montează finAgreementsRoutes la `/api/fin/agreements`

## Tests

- **T-AGREEMENT-002-1** [blocant] Route `/api/fin/agreements` montată în `server/app.ts`
- **T-AGREEMENT-002-2** [blocant] POST cu `billingType=recurring` fără `recurrencePeriod` returnează eroare de validare
- **T-AGREEMENT-002-3** [blocant] DELETE handler setează status `cancelled` (soft delete)
- **T-AGREEMENT-002-4** [blocant] `next_bill_date` calculat corect pentru `monthly` (primul zi a lunii viitoare)
- **T-AGREEMENT-002-5** [normal] GET handler aplică filtrul status
- **T-AGREEMENT-002-6** [normal] POST /:id/services inserează serviciu cu agreementId corect

## DoD

- TypeScript strict, zero any
- check-route-mounts verde (finAgreementsRoutes montat)
- check-undefined-refs verde
- vite build verde
- Toate testele T1-T6 verzi
