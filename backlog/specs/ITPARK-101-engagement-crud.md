---
id: ITPARK-101
title: "Engagement (Dosar de verificare) CRUD — API + UI listă + detaliu"
milestone: ITPARK
phase: "B"
status: pending
attempts: 0
depends_on: ["ITPARK-001", "ITPARK-003"]
spec: backlog/specs/ITPARK-101-engagement-crud.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
CRUD complet pentru dosarul de verificare anuală MITP (un rezident, un an): creare, listare, editare,
ștergere, plus pagina de detaliu care va găzdui anexele. Izolat pe tenant.

## User stories
- **Ca** contabil, **vreau** să creez un dosar pentru un rezident pe un an, **pentru că** apoi adaug
  liniile și generez anexele.
- **Ca** contabil, **vreau** o listă cu toate dosarele (rezident, an, status, pondere), **pentru că**
  lucrez cu mulți clienți și vreau să văd rapid unde am rămas.

## Acceptance criteria
- [ ] API `GET/POST/PUT/DELETE /api/itpark/engagements` (+ `GET /:id`) — toate scoped pe tenant
- [ ] Câmpuri: residentName, idno, mitpContractNo, mitpContractDate, legalAddress, vatPayer,
  periodStart, periodEnd, reportingYear, auditFirmName, subcontractorCostsCents/Pct,
  adjustedRevenueCents, employeeInfoProcedure, status
- [ ] Rute montate în `app.ts` (același commit — §3.5.1 route-mount)
- [ ] UI listă `/app/fin/itpark` — coloane: rezident, IDNO, an, status, pondere eligibilă (când există), acțiuni
- [ ] UI detaliu `/app/fin/itpark/:id` — header dosar + taburi placeholder pentru Anexa 2/3/4 + scrisori (umplute în fazele E/F)
- [ ] Validare: IDNO numeric, perioadă validă (start ≤ end), an = anul perioadei
- [ ] Empty state când nu există dosare (CTA „Creează primul dosar"); design-system tokens, dark mode, a11y
- [ ] Gating rol: viewer read-only

## Files
**New:** `server/routes/itparkEngagements.ts`, `src/lib/api/itparkEngagements.ts`,
`src/pages/app/fin/itpark/ItparkList.tsx`, `src/pages/app/fin/itpark/ItparkDetail.tsx`, teste
**Modified:** `server/app.ts` (mount), `src/App.tsx` (rute)

## Tests
- **T-101-1** [blocant] POST engagement → 201; GET listă conține dosarul; alt tenant nu-l vede
- **T-101-2** [blocant] rută montată (nu „Unexpected token '<'")
- **T-101-3** [normal] validare perioadă invalidă → 400 cu mesaj
- **T-101-4** [normal] pagina listă randează empty state fără crash

## DoD
- check-route-mounts + check-refs + vitest verzi; live API smoke (login + engagements 200)
- a11y axe 0 critical/serious; dark mode OK
- Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
