---
id: GAP-013
title: Lecții de recuperare — lecție anulată generează credit, student rezervă slot liber
milestone: GAP
phase: "4"
branch: feat/GAP-faza-4-analytics
depends_on: [GAP-005]
---

## Goal
Când o lecție e marcată ca anulată (de student sau profesor), sistemul generează automat un
credit de recuperare. Studentul poate rezerva un slot liber din orarul profesorului ca lecție
de recuperare, consumând creditul. Directorul vede lista creditelor active și lecțiile de recuperare programate.

## User stories
- Ca student, vreau să rezerv o lecție de recuperare când am anulat, ca să nu pierd ora plătită.
- Ca director, vreau să văd lista creditelor de recuperare nefolosite, ca să urmăresc datoria față de studenți.
- Ca profesor, vreau să văd în orar care lecții sunt de recuperare, ca să mă pregătesc corespunzător.

## Acceptance criteria
- [ ] Schema `makeup_credits` (id, tenantId, studentId, originalLessonId, status pending/used/expired, expiresAt, usedLessonId nullable).
- [ ] Când un lesson e marcat `cancelled`, dacă studentul are un subscription activ sau a plătit, se creează automat un makeup_credit.
- [ ] API `GET /api/makeup-credits` (admin) — listare credite active per tenant.
- [ ] API `POST /api/makeup-credits/:id/use` — rezervă un lesson_id existent ca makeup pentru acest credit.
- [ ] Lecția de recuperare apare în orar cu label "Recuperare".
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/db/schema/makeupCredits.ts`
- `server/db/schema/index.ts`
- `drizzle/0033_gap013_makeup_credits.sql`
- `server/routes/makeupCredits.ts`
- `server/app.ts`
- `src/__tests__/gap013-makeup.test.ts`

## Tests
- **T-GAP-013-1** [blocant] Given lecție marcată cancelled cu student subscribed, Then makeup_credit creat automat
- **T-GAP-013-2** [blocant] Given POST /api/makeup-credits/:id/use cu lessonId valid, Then credit status=used și lesson legat
- **T-GAP-013-3** [blocant] Given GET /api/makeup-credits, Then 200 cu lista credite pending
- **T-GAP-013-4** [normal] Given credit expirat (expiresAt în trecut), When GET /api/makeup-credits, Then nu apare în lista active

## Definition of Done
- Migrare 0033; db:reset + db:seed trec. Build verde. Teste blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student OK.
