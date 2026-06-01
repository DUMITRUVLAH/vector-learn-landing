---
id: GAP-020
title: Leaderboard per cursă/cohortă — top studenți după prezență + teme + badge-uri
milestone: GAP
phase: "6"
branch: feat/GAP-faza-6-gamificare
depends_on: [GAP-019]
---

## Goal
Fiecare cohortă are un leaderboard opțional vizibil în portalul student, unde studenții văd
clasamentul anonim (rang + prenume + scor) după o formulă configurabilă (prezență × W1 + teme × W2 + badges × W3).
Directorul poate activa/dezactiva leaderboard-ul per cohortă și vedea scorul complet.

## User stories
- Ca student, vreau să văd clasamentul cohortei (anonim), ca să fiu motivat să particip mai activ.
- Ca director, vreau să pot activa/dezactiva clasamentul per cohortă, ca să respect preferințele clienților.

## Acceptance criteria
- [ ] Cohort adaugă câmpuri `leaderboardEnabled` (bool default false) și scor formula weights.
- [ ] API `GET /api/cohorts/:id/leaderboard` — returnează top-N participanți cu {rank, firstName, score}; anonim (fără lastName).
- [ ] API `GET /api/portal/:token/leaderboard` — student vede clasamentul cohortei sale.
- [ ] StudentPortalPage.tsx: secțiune "Clasament" vizibilă doar dacă leaderboardEnabled=true.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/db/schema/cohorts.ts` (adaugă câmpuri)
- `drizzle/0036_gap020_leaderboard.sql`
- `server/routes/leaderboard.ts`
- `server/app.ts`
- `src/pages/portal/StudentPortalPage.tsx`
- `src/__tests__/gap020-leaderboard.test.ts`

## Tests
- **T-GAP-020-1** [blocant] Given cohortă cu leaderboardEnabled=true, When GET /api/cohorts/:id/leaderboard, Then 200 cu ranks
- **T-GAP-020-2** [blocant] Given cohortă cu leaderboardEnabled=false, When GET /api/cohorts/:id/leaderboard, Then 403 sau array gol cu reason
- **T-GAP-020-3** [blocant] Given GET /api/portal/:token/leaderboard, Then 200 cu clasament sau disabled message
- **T-GAP-020-4** [normal] Given StudentPortalPage cu leaderboard enabled, When render, Then secțiunea vizibilă fără crash

## Definition of Done
- Migrare 0036; db:reset + db:seed trec. Build verde. Teste blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student LOVES.
