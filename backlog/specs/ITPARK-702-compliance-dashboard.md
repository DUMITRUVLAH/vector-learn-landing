---
id: ITPARK-702
title: "Dashboard conformitate MITP (pondere YTD, risc prag, deadline aprilie)"
milestone: ITPARK
phase: "H"
status: pending
attempts: 0
depends_on: ["ITPARK-302", "ITPARK-101"]
spec: backlog/specs/ITPARK-702-compliance-dashboard.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
O vedere de ansamblu pe toate dosarele tenantului: status conformitate (pondere eligibilă YTD per
rezident), risc de prag, și termenul de predare (sfârșit aprilie). Cardul de valoare la nivel de cont.

## User stories
- **Ca** firmă de contabilitate cu mulți clienți MITP, **vreau** un singur ecran care arată cine e sub
  prag și cine n-a predat dosarul, **pentru că** gestionez zeci de rezidenți înainte de deadline.

## Acceptance criteria
- [ ] `/app/fin/itpark/dashboard`: listă rezidenți cu pondere YTD, status prag (conform/avertisment/risc), status dosar (draft/ready/exported), zile până la deadline (30 aprilie)
- [ ] Carduri sumar: nr. dosare, câte sub prag, câte gata de predat
- [ ] Filtrare/sortare; click → detaliul dosarului
- [ ] Cifrele din motor (ITPARK-302); design-system, dark mode, a11y

## Files
**New:** `src/pages/app/fin/itpark/ComplianceDashboard.tsx`, endpoint sumar `server/routes/itparkDashboard.ts`, test
**Modified:** `server/app.ts` (mount), `src/App.tsx` (rută)

## Tests
- **T-702-1** [normal] dashboard arată pondere YTD + status prag + deadline; sub-prag evidențiat
- **T-702-2** [blocant] endpoint montat → 200

## DoD
- check-route-mounts + check-refs + vitest verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED; Persona reports salvate
