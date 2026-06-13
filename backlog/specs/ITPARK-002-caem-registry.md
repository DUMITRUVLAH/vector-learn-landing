---
id: ITPARK-002
title: "Nomenclator CAEM versionat + seed listă oficială MITP + API read"
milestone: ITPARK
phase: "A"
status: pending
attempts: 0
depends_on: ["ITPARK-001"]
spec: backlog/specs/ITPARK-002-caem-registry.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Nomenclatorul de coduri CAEM eligibile (sursă unică, versionată, NICIODATĂ hardcodat în `.tsx`), cu
seed-ul listei oficiale MITP din CORE §4 și un endpoint de citire pentru autocomplete/sugestie.

## User stories
- **Ca** contabil, **vreau** o listă oficială de coduri eligibile, **pentru că** nu vreau să caut în
  lege ce cod e eligibil.
- **Ca** dezvoltator, **vreau** codurile versionate (`effectiveFrom`), **pentru că** lista se schimbă
  legislativ și nu vreau să rescriu cod.

## Acceptance criteria
- [ ] Seed `itparkCaemCodes` cu TOATE codurile din CORE §4 (`62.01,58.21,58.29,62.02,62.03,62.09,63.11,63.12,85.59,72.19.*,72.11,26.11,59.12.*,59.20.13,74.10,78.30.*,82.20` + rândul descriptiv), `eligible=true`, `effectiveFrom` 2024-01-01, `country="MD"`
- [ ] Fiecare cod are `label` în română (ex. `85.59` → „Alte forme de învățământ (instruire digital)")
- [ ] `GET /api/itpark/caem-codes` → listă activă (la data curentă), filtrabilă `?eligible=true`
- [ ] Rută montată în `server/app.ts` (`app.route("/api/itpark/caem-codes", …)`) — același commit
- [ ] Un cod neprezent în seed → considerat `eligible=false` la lookup (helper `isEligibleCaem(code)`)
- [ ] Fără hex/valori hardcodate în UI; codurile vin din API

## Files
**New:** `server/routes/itparkCaem.ts`, `src/lib/api/itparkCaem.ts`
**Modified:** `server/db/seed.ts` (seed coduri), `server/app.ts` (mount)

## Tests
- **T-002-1** [blocant] seed conține codurile eligibile; `85.59` și `62.02` `eligible=true`
- **T-002-2** [normal] cod `47.11` → `isEligibleCaem` false
- **T-002-3** [blocant] `GET /api/itpark/caem-codes` montat → 200 + JSON (nu HTML fallback)

## DoD
- Migration gate (dacă atinge schema) verde; check-route-mounts verde
- Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
