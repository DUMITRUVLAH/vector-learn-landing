---
id: GAP-011
title: Înscriere publică online — student se înscrie singur în cohortă + plată
milestone: GAP
phase: "4"
branch: feat/GAP-faza-4-analytics
depends_on: [GAP-001, GAP-005]
---

## Goal
Un prospect poate accesa o pagină publică `/enroll/:cohortSlug`, vede detaliile cohortei
(program, profesor, preț, locuri rămase), se înscrie completând un formular simplu
(nume, email, telefon), și primește un link de plată (Stripe Checkout) sau confirmarea că
a fost adăugat pe lista de așteptare dacă cohorta e plină.
La finalizarea plății, studentul e creat automat (sau atașat la familia existentă dacă
emailul există deja) și adăugat în cohortă.

## User stories
- Ca prospect, vreau să mă înscriu online la un curs fără să sun la secretariat, ca să economisesc timp.
- Ca director, vreau ca înscrierea să creeze automat studentul și plata în sistem, ca să nu mai introduc manual.
- Ca prospect cu cohorta plină, vreau să fiu adăugat pe lista de așteptare, ca să fiu anunțat când se eliberează un loc.
- Ca director, vreau să văd câte înscrieri online au venit per cohortă, ca să știu ce cursuri au cerere.

## Acceptance criteria
- [ ] Schema `enrollment_requests` cu: id, tenantId, cohortId, name, email, phone, status (pending/paid/waitlisted/cancelled), stripeSessionId, createdAt.
- [ ] API `GET /api/enroll/:cohortSlug` — public, returnează cohort details (name, description, teacher, schedule, price, seats_remaining).
- [ ] API `POST /api/enroll/:cohortSlug` — public, creează enrollment_request; dacă cohorta are locuri → returnează Stripe Checkout URL (placeholder dacă Stripe nu e configurat — URL fictiv OK); dacă e plină → status waitlisted.
- [ ] API `POST /api/enroll/stripe-webhook` — webhook Stripe checkout.session.completed → marchează request ca paid, creează student + family + cohort participant.
- [ ] Pagină publică `src/pages/enroll/EnrollPage.tsx` la ruta `#/enroll/:cohortSlug` — afișează detalii cohortă + formular înscriere.
- [ ] Design: design system, dark mode, mobile-first, zero hex hardcodat.
- [ ] Cohort trebuie să aibă câmpurile `slug` (varchar, unique per tenant) și `maxParticipants` — dacă nu există, adaugă migrare.

## Files to create/modify
- `server/db/schema/enrollmentRequests.ts` — tabel nou
- `server/db/schema/index.ts` — export
- `server/db/schema/cohorts.ts` — adaugă slug + maxParticipants dacă lipsesc
- `drizzle/0031_gap011_enrollment.sql` — migrare (prefix 0031)
- `server/routes/enroll.ts` — route handler
- `server/app.ts` — mount
- `src/pages/enroll/EnrollPage.tsx` — pagina publică
- `src/App.tsx` — rută publică /enroll/:cohortSlug
- `src/__tests__/gap011-enrollment.test.ts` — tests

## Tests
- **T-GAP-011-1** [blocant] Given cohortă cu locuri, When POST /api/enroll/:slug cu date valide, Then enrollment_request created cu status pending și checkoutUrl returnat
- **T-GAP-011-2** [blocant] Given cohortă plină (participants = maxParticipants), When POST /api/enroll/:slug, Then status waitlisted
- **T-GAP-011-3** [blocant] Given Stripe webhook checkout.session.completed, When POST /api/enroll/stripe-webhook, Then student creat și cohort_participant adăugat
- **T-GAP-011-4** [blocant] Given slug invalid, When GET /api/enroll/:slug, Then 404
- **T-GAP-011-5** [blocant] Given EnrollPage cu slug valid, When render, Then detalii cohortă afișate fără crash
- **T-GAP-011-6** [normal] Given formular completat, When submit, Then loading state vizibil

## Definition of Done
- Migrare 0031 generată și commitată; db:reset + db:seed trec.
- Build + typecheck + lint verde.
- Toate testele blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED.
- Personas: manager — BUY; student — LOVES/OK.
