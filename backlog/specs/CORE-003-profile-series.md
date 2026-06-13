---
id: CORE-003
title: "API profil firmă + serie de facturare (CRUD, numerotare secvențială)"
milestone: FIN
phase: "1"
status: pending
attempts: 0
depends_on: [CORE-001]
spec: backlog/specs/CORE-003-profile-series.md
core: backlog/fin/FIN-CORE.md
---

## Goal

API-ul pentru profilul fiscal al firmei și seriile de facturare, cu numerotare strict secvențială
fără găuri (regula #9 din FIN-CORE §2). Pe asta se bazează emiterea facturilor (BILL).

## User stories

- **Ca** owner, **vreau** să setez datele fiscale ale firmei (cod fiscal, regim TVA, valută), **pentru că** facturile și declarațiile depind de ele.
- **Ca** contabil, **vreau** o serie de facturare cu numerotare automată, **pentru că** numerele trebuie să fie consecutive (cerință fiscală).

## Acceptance criteria

- [ ] `server/routes/finOrg.ts`: `GET/PATCH /api/fin/org` — profil fiscal (1/tenant), validare IDNO (MD 13 cifre / RO CUI), regim TVA
- [ ] `GET/POST/PATCH/DELETE /api/fin/series` — serii de facturare
- [ ] `POST /api/fin/series/:id/next` — alocă următorul număr **atomic** (tranzacție, fără găuri/duplicate sub concurență)
- [ ] Format număr: `{prefix}{number padded to pad_width}` (ex. `VEGA-2026-0001`)
- [ ] O singură serie `is_default=true` per `doc_type` (guard)
- [ ] Rute montate în `server/app.ts` (același commit)
- [ ] Tenant isolation pe toate

## Files

**New:**
- `server/routes/finOrg.ts`
- `server/routes/__tests__/finOrg.test.ts`
- `src/lib/api/finOrg.ts` (client typed)

**Modified:**
- `server/app.ts` — mount `finOrgRoutes`

## Tests

- **T-CORE-003-1** [blocant] `PATCH /api/fin/org` cu IDNO invalid → 400
- **T-CORE-003-2** [blocant] `POST /series/:id/next` de 3× consecutiv → 0001, 0002, 0003 fără găuri
- **T-CORE-003-3** [blocant] 10 apeluri concurente `next` → 10 numere distincte, fără duplicate (atomicitate)
- **T-CORE-003-4** [blocant] A doua serie default pe același doc_type → 400 sau demote-ul primei
- **T-CORE-003-5** [blocant] `check-route-mounts.mjs` verde
- **T-CORE-003-6** [blocant] Tenant isolation: org-ul altui tenant inaccesibil

## DoD

- Live API smoke verde (login + /api/fin/org + /api/fin/series → 200)
- DB-portability: fără raw `.execute().rows` (query builder)
- Reviewer APPROVED; integration-architect `CONNECTED`
- Persona reports salvate
