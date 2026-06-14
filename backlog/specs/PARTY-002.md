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
contactelor lor (`fin_party_contacts`): CRUD complet cu validare IDNO și IBAN, filtru pe
kind/country/isActive, paginare. Routa se montează în `server/app.ts` sub `/api/fin/parties`.

## User stories

- **Ca** contabil, **vreau** să listez toți partenerii activi de tip client.
- **Ca** admin, **vreau** să creez un partener nou cu IDNO și IBAN validate.
- **Ca** utilizator, **vreau** să editez adresa sau IBAN-ul unui partener existent.
- **Ca** sistem, **vreau** soft-delete (isActive=false) — nu șterg parteneri cu documente legate.

## Acceptance criteria

- [ ] `server/routes/finParties.ts` cu Hono router `finPartiesRoutes`:
  - GET /api/fin/parties — list (query: kind, country, isActive, search, limit, offset)
  - GET /api/fin/parties/:id — single sau 404
  - POST /api/fin/parties — creare cu validare zod
  - PATCH /api/fin/parties/:id — editare parțială
  - DELETE /api/fin/parties/:id — soft delete (isActive=false)
  - GET /api/fin/parties/:id/contacts — contactele partenerului
  - POST /api/fin/parties/:id/contacts — adaugă contact
  - DELETE /api/fin/parties/:id/contacts/:contactId — șterge contact
- [ ] Toate rutele sunt auth-guard (requireAuth middleware)
- [ ] `server/app.ts` montează `finPartiesRoutes` la `/api/fin/parties`
- [ ] Răspunsuri JSON: `{ data: ... }` sau `{ data: [...], total: N }` pentru liste
- [ ] Validare: IDNO max 13 chars alfanumerice; IBAN format `^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$`

## Files

**New:**
- `server/routes/finParties.ts` — Hono router CRUD parteneri + contacte
- `src/__tests__/fin/party-002-api.test.ts` — teste unit pe validare + sursa rutelor

**Modified:**
- `server/app.ts` — montează finPartiesRoutes la `/api/fin/parties`

## Tests

- **T-PARTY-002-1** [blocant] Route `/api/fin/parties` montată în `server/app.ts`
- **T-PARTY-002-2** [blocant] IDNO regex respinge caractere invalide
- **T-PARTY-002-3** [blocant] IBAN regex respinge formate invalide
- **T-PARTY-002-4** [blocant] DELETE handler face soft-delete (isActive: false)
- **T-PARTY-002-5** [normal] GET handler aplică filtrul kind
- **T-PARTY-002-6** [normal] POST /:id/contacts inserează contact asociat

## DoD

- TypeScript strict, zero any
- check-route-mounts verde (finPartiesRoutes montat)
- check-undefined-refs verde
- vite build verde
- Toate testele T1-T6 verzi
