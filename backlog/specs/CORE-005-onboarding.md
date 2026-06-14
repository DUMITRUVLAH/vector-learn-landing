---
id: CORE-005
title: "Onboarding 3 pași (<10 min): firmă → parteneri → prima factură"
milestone: FIN
phase: "1"
status: pending
attempts: 0
depends_on: [CORE-003, CORE-004]
spec: backlog/specs/CORE-005-onboarding.md
core: backlog/fin/FIN-CORE.md
---

## Goal

Tur de onboarding ghidat care duce o firmă nouă de la zero la prima factură în <10 minute, 3 pași
(pattern adoptat de la concurenți, fără a copia denumirile). Folosește `fin_onboarding` (CORE-001).

## User stories

- **Ca** firmă nouă, **vreau** un ghid pas-cu-pas, **pentru că** vreau să fiu operațional fără training.
- **Ca** owner, **vreau** să văd progresul (pas 2/3), **pentru că** știu cât mai am.

## Acceptance criteria

- [ ] `GET/PATCH /api/fin/onboarding` — citește/avansează pasul (`company|parties|first_invoice|done`)
- [ ] UI 3 pași: (1) Configurează compania (date + logo + serie facturare) → (2) Adaugă primul partener → (3) Emite prima factură
- [ ] Progres vizibil (1/3, 2/3, 3/3), skip permis, reluabil
- [ ] La `done`, redirect către `/app/fin` (FinHome), nu mai apare turul
- [ ] Fiecare pas linkează către ecranul real (CORE-003 org/serie; PARTY/BILL apar după ce sunt construite — graceful dacă încă nu există: pasul 2/3 afișează „în curând" dar nu blochează pasul 1)
- [ ] Rută montată; tenant isolation

## Files

**New:**
- `server/routes/finOnboarding.ts`
- `src/pages/fin/FinOnboarding.tsx`
- `src/pages/fin/__tests__/FinOnboarding.test.tsx`

**Modified:**
- `server/app.ts` — mount `finOnboardingRoutes`
- `src/App.tsx` — rută `/app/fin/onboarding`

## Tests

- **T-CORE-005-1** [blocant] `PATCH /onboarding` avansează pasul + persistă
- **T-CORE-005-2** [blocant] La `done`, `GET` întoarce step=done; UI nu mai forțează turul
- **T-CORE-005-3** [blocant] Onboarding randează fără crash (smoke)
- **T-CORE-005-4** [blocant] `check-route-mounts.mjs` + `check-undefined-refs.mjs` verzi
- **T-CORE-005-5** [normal] Skip duce direct la FinHome

## DoD

- Build + smoke verzi; check-refs + route-mounts verzi
- Reviewer APPROVED; integration-architect `CONNECTED`
- Persona reports salvate
- **Marchează finalul Fazei 1 CORE**: un singur PR `feat/FIN-core` cu CORE-001..005, build+typecheck+lint+test verzi pe tot branch-ul, `db:reset`+`db:seed` OK
