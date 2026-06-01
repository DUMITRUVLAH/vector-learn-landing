---
id: SET-804
title: "Onboarding wizard pentru tenant nou"
milestone: SET
phase: "1 — Settings Foundation"
priority: P0
slug: onboarding-wizard
depends_on: [SET-801, SET-802]
status: pending
---

# SET-804 — Onboarding wizard: logo → primul curs → primul profesor → import elevi

## Goal

A new tenant (fresh signup) is guided through a 4-step wizard that ensures the
bare minimum is configured before they see the main app. This reduces activation
friction and ensures a usable demo state from day one.

## User stories

- Ca Owner nou, vreau un wizard care mă ghidează pas-cu-pas (logo, curs, profesor, elevi),
  pentru că fără ghidaj nu știu de unde să încep.
- Ca Owner, vreau să pot sări pași din wizard și să revin mai târziu, pentru că poate
  nu am toate datele acum.
- Ca Admin, vreau ca wizardul să fie accesibil din Settings → "Finalizează configurarea",
  pentru că vreau să revin dacă am sărit ceva la prima accesare.
- Ca Owner, vreau să văd progresul wizardului (3/4 pași completați), pentru că îmi
  dă sentimentul că aproape am terminat.

## Acceptance criteria

- [ ] DB: coloană `onboarding_step INT DEFAULT 0` pe tabelul `tenants` (0=not started,
      1=branding done, 2=course done, 3=teacher done, 4=completed); migrare comisă
- [ ] `GET /api/settings/onboarding` — returnează `{ step, completed, skipped }`
- [ ] `PATCH /api/settings/onboarding` — body: `{ step }` — marchează progresul
- [ ] Pagina `/app/onboarding` (wizard multi-step):
      - Step 1: Upload logo + setare culoare primară (refolosește componente SET-802)
      - Step 2: Creare prim curs (name, subject, max students) via API existent
      - Step 3: Adăugare prim profesor (name, email, phone) via API existent
      - Step 4: Import minim elevi (CSV drag&drop sau "sari") via import existent
      - Progress bar cu 4 pași
      - Buton "Sari acest pas" pe fiecare step
      - Buton "Finalizează" pe ultimul pas → redirect `/app/dashboard`
- [ ] Redirecționare automată: dacă tenant are `onboarding_step < 4`, prima autentificare
      redirecționează la `/app/onboarding`
- [ ] Banner în Dashboard "Finalizează configurarea (X/4 pași)" cu link → `/app/onboarding`
      când `onboarding_step < 4`
- [ ] Buton "Reia wizard" în `/app/settings/general` sau Settings sidebar
- [ ] Dark mode parity

## Files

### New files
- `server/routes/settings/onboarding.ts`
- `src/pages/settings/OnboardingWizard.tsx`
- `src/components/settings/OnboardingStep.tsx` — wrapper refolosibil per step
- `src/__tests__/settings/onboarding.test.ts`

### Modified files
- `server/db/schema/index.ts` — coloana onboarding_step pe tenants
- `server/index.ts` — mount ruta
- `src/App.tsx` — ruta `/app/onboarding`
- `src/pages/DashboardPage.tsx` — banner onboarding dacă step < 4

## Tests

- **T-SET-804-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes
- **T-SET-804-2** [blocant] Given: server pornit, When: login + GET /api/settings/onboarding,
  Then: 200 cu `{ step: number, completed: boolean }`
- **T-SET-804-3** [blocant] Given: PATCH /api/settings/onboarding cu `{ step: 2 }`, Then: 200
  + step actualizat
- **T-SET-804-4** [normal] Given: OnboardingWizard randat la step 1, When: user completează
  logo upload (mock), Then: step avansat la 2 și progress bar actualizat
- **T-SET-804-5** [normal] Given: tenant cu onboarding_step=0, When: login user, Then:
  redirecționat la /app/onboarding

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-SET-804-x trec
- [ ] Migration comisă (`drizzle/0037_set804_onboarding.sql`)
- [ ] `db:reset && db:seed` succes
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/SET-faza-1-settings`
