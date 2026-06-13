---
id: BILL-002
title: "API facturi B2B: emitere, numerotare, TVA per linie, statusuri"
milestone: FIN
phase: "5"
status: pending
attempts: 0
depends_on: [BILL-001, REGISTRY-002, AGREEMENT-001]
spec: backlog/specs/BILL-002.md
branch: feat/FIN-bill
---

## Goal

Endpoints REST complete pentru gestionarea facturilor B2B (`fin_invoices`) și liniilor lor.
Logica cheie: numerotare automată per tenant (`FIN-2026-0001`), TVA calculat per linie (regula #1
FIN-CORE), tranziții de status (`draft→issued→paid|overdue|cancelled`), posibilitate de emitere
din contract (`agreementId`) sau ad-hoc. Rutele se montează la `/api/fin/invoices`.

Refolosire: pattern CRUD din `finAgreementsRoutes` (AGREEMENT-002) — auth guard, error handling,
zod validation. Logica de numerotare poate refolosi tiparul din `invoicesRoutes` (dar tabele diferite).

## User stories

- **Ca** contabil, **vreau** să creez o factură B2B dintr-un contract existent,
  **pentru că** voi să fie pre-populată cu serviciile contractului.
- **Ca** contabil, **vreau** să creez o factură ad-hoc (fără contract), cu linii manuale,
  **pentru că** nu toate serviciile sunt contractate formal.
- **Ca** sistem, **vreau** ca TVA-ul să fie calculat per linie și totalizat la nivel de factură,
  **pentru că** FIN-CORE regula #1: TVA obligatoriu per linie, nu global.
- **Ca** contabil, **vreau** să schimb statusul facturii din `issued` în `paid` sau `cancelled`,
  **pentru că** urmăresc ciclul de viață al fiecărei facturi.

## Acceptance criteria

- [ ] `server/routes/finInvoices.ts` cu Hono router `finInvoicesRoutes`:
  - GET `/api/fin/invoices` — list (query: status, partyId, agreementId, search, limit, offset)
    cu `partyName` din join `fin_parties`
  - GET `/api/fin/invoices/:id` — single cu linii incluse sau 404
  - POST `/api/fin/invoices` — creare factură:
    - Payload: `{ partyId?, agreementId?, lines: [{description, quantity, unitPriceCents, vatPct}], currency?, dueDate?, notes? }`
    - Dacă `agreementId` prezent: pre-populează liniile din serviciile contractului (dacă `lines` nu e furnizat explicit)
    - Numerotare automată: `SELECT MAX(number)+1 WHERE tenantId` pe `fin_invoices` (nu pe `invoices`)
    - `invoiceNumber` format: `FIN-YYYY-NNNN` (series `FIN`, year curent, number padded 4 cifre)
    - Calculează `lineTotalCents` per linie: `quantity * unitPriceCents * (100 + vatPct) / 100` (rotunjit int)
    - Calculează `totalCents` = suma lineTotalCents; `vatTotalCents` = suma `quantity * unitPriceCents * vatPct / 100`
    - TVA: dacă orice linie are `vatPct` lipsă → 422 (regula #1 FIN-CORE)
    - Returnează 201 cu `{ data: { id, invoiceNumber, totalCents, vatTotalCents, lines } }`
  - PATCH `/api/fin/invoices/:id` — editare parțială (status, notes, dueDate)
    - Tranziții permise: `draft→issued`, `issued→paid`, `issued→overdue`, `issued→cancelled`, `overdue→paid`, `overdue→cancelled`
    - Dacă tranziție invalidă → 422 cu mesaj clar
    - `issued` setează `issuedAt = now()`
  - DELETE `/api/fin/invoices/:id` — soft delete: status → `cancelled` (nu ștergere fizică)
  - GET `/api/fin/invoices/:id/lines` — lista liniilor
  - POST `/api/fin/invoices/:id/lines` — adaugă linie pe factură existentă (doar `draft`); recalculează totaluri
  - DELETE `/api/fin/invoices/:id/lines/:lineId` — șterge linie (doar `draft`); recalculează totaluri
- [ ] Toate rutele auth-guard cu `requireAuth`
- [ ] `server/app.ts` montează `finInvoicesRoutes` la `/api/fin/invoices`
- [ ] Răspunsuri JSON: `{ data: ... }` sau `{ data: [...], total: N }` pentru liste
- [ ] Validare zod completă: `unitPriceCents >= 0`, `quantity >= 1`, `vatPct` 0–100 (NOT NULL — regula #1)
- [ ] Tenant isolation: toate query-urile filtrează pe `tenantId`

## Files

**New:**
- `server/routes/finInvoices.ts` — Hono router CRUD facturi B2B + linii
- `src/__tests__/fin/bill-002-api.test.ts` — teste unit pe logica API

**Modified:**
- `server/app.ts` — montează finInvoicesRoutes la `/api/fin/invoices`

## Tests

- **T-BILL-002-1** [blocant] Ruta `/api/fin/invoices` montată în `server/app.ts`
- **T-BILL-002-2** [blocant] POST `/api/fin/invoices` cu linii returnează 201 cu `invoiceNumber` format `FIN-YYYY-NNNN`
- **T-BILL-002-3** [blocant] POST cu linie fără `vatPct` (undefined/null) returnează 422 (regula #1 TVA)
- **T-BILL-002-4** [blocant] `totalCents` calculat corect: `qty * unitPriceCents * (100 + vatPct) / 100`
- **T-BILL-002-5** [blocant] PATCH status `draft→cancelled` returnează 422 (tranziție invalidă)
- **T-BILL-002-6** [blocant] PATCH status `issued→paid` → 200, `issuedAt` nemodificat, status actualizat
- **T-BILL-002-7** [normal] GET `/api/fin/invoices` cu filtru `status=draft` returnează doar facturi draft
- **T-BILL-002-8** [normal] Numerotare consecutivă: 2 POST consecutive → numbers consecutive pe același tenant

## DoD

- TypeScript strict, zero any
- check-route-mounts verde (finInvoicesRoutes montat)
- check-undefined-refs verde
- vite build verde
- Toate testele T1-T6 (blocant) verzi
