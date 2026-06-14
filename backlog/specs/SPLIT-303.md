---
id: SPLIT-303
title: "E2E smoke: ambele login-uri izolate; acces încrucișat respins; rute cheie 200"
milestone: SPLIT
phase: "4"
status: pending
branch: feat/SPLIT-crm-cleanup
depends_on: [SPLIT-204, SPLIT-301]
spec: backlog/specs/SPLIT-303.md
---

## Goal

Test suite de integrare care verifică că separarea celor 2 aplicații funcționează end-to-end:
1. `/app/login` autentifică utilizatorul CRM și oferă acces la `/app/*`.
2. `/business/login` autentifică utilizatorul Business Suite și oferă acces la `/business/*`.
3. Un user autentificat pe CRM NU poate accesa `/business/dashboard` (redirecționare la `/business/login`).
4. Un user autentificat pe Business Suite NU poate accesa `/app/students` (redirecționare la `/app/login`).
5. Rutele cheie returnează 200 pe ambele aplicații (nu crash, nu HTML în loc de JSON).

Testele sunt **vitest unit + integration tests** (nu Playwright — mediul CI nu are Chrome headless). Se pot mock-ui sesiunile pentru testele de guard.

## User Stories

- Ca developer, vreau să am un test suite care să confirme că separarea aplicațiilor funcționează, pentru că altfel o modificare ulterioară poate reuni accidental aplicațiile.
- Ca owner, vreau certitudine că un user business nu vede date CRM și viceversa, pentru că sunt clienți diferiți cu confidențialitate diferită.

## Acceptance Criteria

- [ ] Test: `/app/login` flow → sesiune learn → `requireApp('learn')` aprobă accesul la `/api/students` (200).
- [ ] Test: `/business/login` flow → sesiune business → `requireApp('business')` aprobă accesul la `/api/fin/expenses/summary` (200 sau similar).
- [ ] Test: sesiune learn încearcă acces la rută business → `requireApp('business')` returnează 403.
- [ ] Test: sesiune business încearcă acces la rută learn → `requireApp('learn')` returnează 403.
- [ ] Test: `/api/par` cu sesiune business → 200 (ruta accesibilă).
- [ ] Test: `/business/dashboard` randat fără sesiune business → BusinessShell redirecționează la `/business/login`.
- [ ] Toate testele trec cu `npm test -- --run`.

## Files Affected

- `src/__tests__/split-isolation.test.ts` — (NOU) suite de teste UI/guard
- `server/routes/__tests__/split-api.test.ts` — (NOU) suite de teste API middleware

## Tests

- **T-SPLIT-303-1** [blocant] Given sesiune cu app_kind='learn', When se apelează requireApp('business'), Then returnează 403.
- **T-SPLIT-303-2** [blocant] Given sesiune cu app_kind='business', When se apelează requireApp('learn'), Then returnează 403.
- **T-SPLIT-303-3** [blocant] Given sesiune cu app_kind='business', When se apelează requireApp('business'), Then trece (200/next).
- **T-SPLIT-303-4** [normal] Given sesiune cu app_kind='learn', When se apelează requireApp('learn'), Then trece (200/next).
- **T-SPLIT-303-5** [normal] Given BusinessDashboardPage randat fără sesiune, When componenta se montează, Then useBusinessSession returnează status='unauthenticated' și guard-ul redirecționează.
- **T-SPLIT-303-6** [normal] Given /business/dashboard randat cu sesiune business validă, When pagina se randează, Then nu există crash și cele 3 KPI cards sunt prezente în DOM.

## DoD

- T-SPLIT-303-{1,2,3} (blocant) trec.
- Build green.
- Reviewer APPROVED, integration CONNECTED.
- Milestone SPLIT COMPLET — toate 13 items done.
