---
id: ONBOARD-001
title: Onboarding wizard — ghid pas-cu-pas pentru tenant nou
milestone: WAVE2
phase: 1
status: pending
priority: P1
depends_on: ["DEMO-001"]
spec: backlog/specs/ONBOARD-001-first-run-wizard.md
---

## Goal

Când un tenant nou se înregistrează și face prima autentificare (0 elevi, 0 profesori, 0 lecții),
afișează un banner de onboarding cu 4 pași: (1) Adaugă un profesor → (2) Adaugă primul elev →
(3) Programează prima lecție → (4) Invitație echipă. Banner-ul dispare odată completat sau ignorat.

## User stories

- Ca director nou de academie, vreau un ghid vizual la prima logare, pentru că altfel nu știu de unde să încep.
- Ca Andreea, vreau să văd un checklist care arată progresul setup-ului, pentru că știu exact ce lipsește.
- Ca administrator Vector Learn, vreau ca utilizatorii noi să ajungă la first value în sub 5 minute.

## Acceptance criteria

1. Server: `GET /api/onboarding/status` returnează `{ completed: boolean, steps: [{id, label, done}] }`:
   - step "add_teacher": done dacă count(teachers WHERE tenant_id=X) > 0
   - step "add_student": done dacă count(students WHERE tenant_id=X) > 0
   - step "schedule_lesson": done dacă count(lessons WHERE tenant_id=X) > 0
   - step "invite_team": done dacă count(users WHERE tenant_id=X) > 1
2. UI: OnboardingBanner apare pe `/app` (dashboard) dacă `completed: false`
3. Banner include progress bar (ex. "2/4 pași completați") și link-uri rapide pentru fiecare pas
4. Buton "Ignoră ghidul" → ascunde banner-ul permanent (localStorage key `onboarding_dismissed_<tenantId>`)
5. Banner NU apare dacă tenant-ul are deja date (completed: true) sau dacă a fost ignorat

## Files

- `server/routes/onboarding.ts` — GET /api/onboarding/status
- `server/app.ts` — montează ruta `/api/onboarding`
- `src/components/app/OnboardingBanner.tsx` — component banner
- `src/pages/app/DashboardPage.tsx` — include OnboardingBanner

## Tests

- **T-ONBOARD-001-1** [blocant] Given tenant cu 0 profesori/elevi/lecții/users, When GET /api/onboarding/status, Then status 200 + all steps done=false + completed=false
- **T-ONBOARD-001-2** [blocant] Given tenant cu 1 profesor, When GET /api/onboarding/status, Then step add_teacher done=true
- **T-ONBOARD-001-3** [normal] Given render OnboardingBanner cu mock steps 2/4, Then afișează "2 / 4 pași completați"
- **T-ONBOARD-001-4** [normal] Given banner vizibil, When click Ignoră, Then banner dispare

## DoD

- [ ] GET /api/onboarding/status returnează structura corectă
- [ ] Banner apare pe dashboard pentru tenant nou
- [ ] Build + lint + unit tests verzi
- [ ] Reviewer APPROVED
