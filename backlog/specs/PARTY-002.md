---
id: PARTY-002
title: "API parteneri CRUD — kind client/supplier/both, validare IDNO/IBAN"
milestone: FIN
phase: "3"
status: pending
attempts: 0
depends_on: [PARTY-001]
spec: backlog/specs/PARTY-002.md
branch: feat/FIN-party
---

## Goal

Endpoints REST pentru gestionarea completă a partenerilor comerciali (`fin_parties`) și a
contactelor lor (`fin_party_contacts`): CRUD complet cu validare IDNO (13 chars numeric, Moldova)
și IBAN (format basic), filtru pe kind/country/isActive, paginare. Routa se montează în
`server/app.ts` sub `/api/fin/parties`.

## User stories

- **Ca** contabil, **vreau** să listez toți partenerii activi de tip client, **pentru că** generez
  o factură și trebuie să îl selectez pe cel corect.
- **Ca** admin, **vreau** să creez un partener nou cu IDNO și IBAN validate, **pentru că** erori în
  datele fiscale întorc facturi respinse la SFS.
- **Ca** utilizator, **vreau** să editez adresa sau IBAN-ul unui partener existent, **pentru că**
  datele se schimbă.
- **Ca** sistem, **vreau** soft-delete (isActive=false), **pentru că** nu șterg parteneri cu
  documente legate, ci îi dezactivez.

## Acceptance criteria

- [ ] `server/routes/finParties.ts` cu Hono router `finPartiesRoutes`:
  - `GET  /api/fin/parties` — list (query: kind, country, isActive, search, limit, offset)
  - `GET  /api/fin/parties/:id` — single sau 404
  - `POST /api/fin/parties` — creare; validare zod: kind enum, country length 2, idno
    `/^\d{13}$/` dacă country=MD, iban opțional validat `/^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/`
  - `PATCH /api/fin/parties/:id` — editare parțială (same validations, toate câmpurile opționale)
  - `DELETE /api/fin/parties/:id` — soft delete (setează isActive=false)
  - `GET  /api/fin/parties/:id/contacts` — contactele partenerului
  - `POST /api/fin/parties/:id/contacts` — adaugă contact
  - `DELETE /api/fin/parties/:id/contacts/:contactId` — șterge contact
- [ ] Toate rutele sunt auth-guard (requireAuth middleware)
- [ ] `server/app.ts` montează `finPartiesRoutes` la `/api/fin/parties`
- [ ] Răspunsuri JSON: `{ data: ... }` sau `{ data: [...], total: N }` pentru liste
- [ ] Erori: `{ error: "not_found" }` 404, `{ error: "forbidden" }` 403, `{ error: [...] }` 422
  pentru validare zod

## Files

**New:**
- `server/routes/finParties.ts` — Hono router CRUD parteneri + contacte
- `src/__tests__/fin/party-002-api.test.ts` — teste unit pe validare zod + logică rute

**Modified:**
- `server/app.ts` — montează finPartiesRoutes la `/api/fin/parties`

## Tests

- **T-PARTY-002-1** [blocant] Route `/api/fin/parties` montată în `server/app.ts`
- **T-PARTY-002-2** [blocant] `POST /api/fin/parties` cu IDNO invalid (< 13 cifre) returnează 422
- **T-PARTY-002-3** [blocant] `POST /api/fin/parties` cu IBAN invalid returnează 422
- **T-PARTY-002-4** [blocant] `DELETE /api/fin/parties/:id` face soft-delete (setează isActive=false)
- **T-PARTY-002-5** [normal] `GET /api/fin/parties?kind=client` returnează doar parteneri de tip client
- **T-PARTY-002-6** [normal] `POST /api/fin/parties/:id/contacts` creează contact asociat

## DoD

- TypeScript strict, zero any
- check-route-mounts verde (finPartiesRoutes montat)
- check-undefined-refs verde
- Toate testele T1-T6 verzi
- Reviewer APPROVED (design route, auth-guard, validare)
- Integration-architect CONNECTED (DB wired, schema reused, no competing system)
