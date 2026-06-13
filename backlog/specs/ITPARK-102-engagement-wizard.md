---
id: ITPARK-102
title: "Wizard creare dosar (3 pași) + autocomplete date rezident din IDNO"
milestone: ITPARK
phase: "B"
status: pending
attempts: 0
depends_on: ["ITPARK-101"]
spec: backlog/specs/ITPARK-102-engagement-wizard.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Onboarding rapid pentru un dosar nou: 3 pași (rezident → perioadă/regim → firma de audit) ca în
practica „onboarding <10 min" a concurenților, cu autocomplete al datelor rezidentului după IDNO.

## User stories
- **Ca** contabil, **vreau** un wizard scurt, **pentru că** creez dosare des și nu vreau un formular lung.
- **Ca** contabil, **vreau** ca datele rezidentului să se completeze din IDNO, **pentru că** nu vreau
  să tastez denumirea/adresa manual.

## Acceptance criteria
- [ ] Wizard 3 pași la `/app/fin/itpark/new`: (1) rezident (denumire, IDNO, adresă, contract MITP),
  (2) perioadă + an + regim TVA + cost subcontractori, (3) firma de audit + confirmare
- [ ] Autocomplete IDNO: la introducerea IDNO, apelează `GET /api/registry/companies/:idno`
  (refolosește `server/lib/companyRegistry.ts` + `server/routes/companyRegistry.ts` — EXISTĂ în repo,
  nu reinventa); pre-completează denumire + adresă din registrul public Moldovan (contafirm.md);
  fallback: dacă lookup eșuează (timeout/offline) sau IDNO nu e găsit, câmpurile rămân editabile manual
  (autocomplete = enhancement, nu blocant)
- [ ] La final → creează engagement (POST) și redirect la detaliu
- [ ] Validare pe fiecare pas; navigare înapoi păstrează datele; design-system, dark mode, a11y, touch targets

## Files
**New:** `src/pages/app/fin/itpark/ItparkWizard.tsx`, componente pași, test
**Modified:** `src/App.tsx` (rută), `src/lib/api/itparkEngagements.ts` (lookup IDNO dacă e cazul)

## Tests
- **T-102-1** [normal] wizard salvează dosarul; câmpuri obligatorii (IDNO, perioadă) validate
- **T-102-2** [normal] navigare înapoi/înainte păstrează valorile

## DoD
- check-refs + vitest verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
