---
id: GAP-010
title: Portal student/parent — vizualizare orar, balanță, lecții viitoare
milestone: GAP
phase: "3"
branch: feat/GAP-faza-3-portal-notificari
depends_on: [GAP-005, GAP-006]
---

## Goal
Un student sau părintele său poate accesa un portal read-only (fără login admin) unde vede:
- Orarul lecțiilor viitoare (7 zile rolling)
- Soldul datorat și ultimele plăți
- Pachetul de credite activ (ore rămase)
- Butoane rapide: Plătește (link către formular Stripe — placeholder OK în faza asta), Contactează

Accesul se face printr-un token magic (UUID token per student) trimis prin SMS/email — fără parolă.
Token-ul expiră după 30 de zile dacă nu e reînnoit.

## User stories
- Ca student, vreau să văd lecțiile mele din săptămâna viitoare fără să mă loghez, ca să știu când am oră.
- Ca părinte, vreau să văd soldul datorat și istoricul plăților copilului meu, ca să pot plăti la timp.
- Ca student cu pachet de ore, vreau să văd câte ore au mai rămas în pachet, ca să știu când cumpăr altul.
- Ca director, vreau să trimit un link magic fiecărui student/familie, ca să reducă apelurile la secretariat.

## Acceptance criteria
- [ ] Schema `student_portal_tokens` cu câmpurile: id, tenantId, studentId, token (UUID), expiresAt, lastUsedAt, createdAt.
- [ ] API `POST /api/portal/token` (admin-only, requireAuth) — generează sau reîmprospătează token pentru studentId.
- [ ] API `GET /api/portal/:token` — returnează fără auth: student name, upcoming lessons (7 days), balance, active package credits.
- [ ] Răspuns 401 dacă token expirat sau invalid. Răspuns 200 cu JSON structurat dacă valid.
- [ ] Pagină `src/pages/portal/StudentPortalPage.tsx` accesibilă la ruta `#/portal/:token`.
- [ ] Pagina afișează: card "Lecțiile tale" (listă cu data, ora, profesor, sală), card "Sold" (sumă datorată), card "Pachet ore" (dacă există), buton "Contactează" (mailto: / tel:).
- [ ] Pagina funcționează fără sesiune admin (nu apelează requireAuth).
- [ ] Token-ul se poate trimite din `StudentsPage` — buton "Trimite portal" care copiază URL-ul în clipboard.
- [ ] Design: design system Vector 365, dark mode, zero hex hardcodat, responsive mobile-first.

## Files to create/modify
- `server/db/schema/studentPortalTokens.ts` — tabel nou
- `server/db/schema/index.ts` — export nou
- `drizzle/0029_gap010_student_portal.sql` — migrare nouă (prefix 0029)
- `server/routes/portal.ts` — route handler pentru GET/POST portal
- `server/app.ts` — mount /api/portal
- `src/pages/portal/StudentPortalPage.tsx` — pagina portalului
- `src/App.tsx` (sau router) — adaugă ruta /portal/:token (public, fără auth guard)
- `src/pages/app/StudentsPage.tsx` — buton "Trimite portal"
- `src/__tests__/gap010-portal.test.ts` — unit tests

## Tests
- **T-GAP-010-1** [blocant] Given un token valid, When GET /api/portal/:token, Then 200 cu lessons array și balance object
- **T-GAP-010-2** [blocant] Given un token expirat (expiresAt în trecut), When GET /api/portal/:token, Then 401
- **T-GAP-010-3** [blocant] Given token inexistent, When GET /api/portal/:token, Then 401
- **T-GAP-010-4** [blocant] Given admin logat, When POST /api/portal/token cu studentId valid, Then 200 cu token UUID
- **T-GAP-010-5** [blocant] Given StudentPortalPage cu token valid, When render, Then lecțiile și soldul sunt afișate fără crash
- **T-GAP-010-6** [normal] Given pagina portal, When dark mode activ, Then zero contrast violations

## Definition of Done
- Migrare 0029 generată și commitată; db:reset + db:seed trec.
- Build + typecheck + lint verde.
- Toate testele blocante trec.
- Reviewer APPROVED (design system, a11y, dark mode).
- Integration-architect CONNECTED (token → student → lessons/payments/packages joins existente).
- Personas: manager — BUY/MAYBE; student — OK/LOVES.
