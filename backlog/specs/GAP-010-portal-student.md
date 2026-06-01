---
id: GAP-010
title: Portal Student self-service
milestone: GAP
phase: 3
priority: HIGH
status: pending
dependencies: [students, student_lessons, GAP-006, GAP-009, invoices, COMM-205]
feeds_into: [GAP-020]
branch: feat/GAP-faza-3-portal-notificari
---

## Scop

Portal dedicat studenților adulți la `/app/student/portal`. Studentul logat vede orarul personal, soldul de unități, facturile, cererile de recuperare. Diferit de SCHOOL-007 (portal părinți pentru copii de școală).

## User stories

- Ca student adult, vreau să-mi văd orarul pentru săptămâna viitoare fără să sun la secretariat.
- Ca student, vreau să văd câte lecții mai am rămase în pachet.
- Ca student, vreau să rezerv o recuperare direct din portal.

## Criterii de acceptare

- [ ] Rol `student` pe `user_role` enum dacă nu există; la login cu rol student → redirect la `/app/student/portal`
- [ ] `GET /api/student/schedule` → lecțiile viitoare ale studentului logat (din `student_lessons` join `lessons`), scoped strict la `(tenantId, studentId)` din sesiune
- [ ] `GET /api/student/balance` → pachete active (GAP-006) cu `unitsRemaining` și `validUntil`
- [ ] `GET /api/student/invoices` → facturile studentului (FIN-601), câmpurile: `id`, `amount`, `status`, `dueDate`
- [ ] `GET /api/student/recovery-requests` → recovery_requests cu status `pending` sau `reserved` (GAP-009)
- [ ] `StudentPortalPage.tsx` la `/app/student/portal` cu 4 tab-uri: Orar / Sold / Facturi / Recuperare
- [ ] Pagina e responsive (mobile-first) și respectă design system Vector 365 (fără hex hardcodat)
- [ ] Un student nu poate accesa datele altui student (scoping strict în toate endpoint-urile)
- [ ] Dark mode funcțional

## Fișiere implicate

- `server/routes/student-portal.ts` — toate endpoint-urile `/api/student/*`
- `src/pages/app/StudentPortalPage.tsx` — pagina nouă
- `src/App.tsx` (sau router) — ruta `/app/student/portal`

## Teste

- Unit: `GET /api/student/schedule` cu student A nu returnează lecțiile studentului B
- Unit: utilizator cu alt rol (manager) nu poate accesa `/api/student/*` → 403
- Smoke: `StudentPortalPage` renderizează cele 4 tab-uri fără crash

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-3-portal-notificari`.
