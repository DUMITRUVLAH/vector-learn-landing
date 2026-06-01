---
id: GAP-006
title: Sold de unități per student per grupă (pachete de lecții)
milestone: GAP
phase: 2
priority: HIGH
status: pending
dependencies: [students, courses, invoices, payments]
feeds_into: [GAP-007, GAP-008, GAP-009, GAP-010]
branch: feat/GAP-faza-2-abonamente-waitlist
---

## Scop

Introduce conceptul de pachet de lecții prepay: un student cumpără N lecții. La fiecare lecție marcată prezent, `unitsRemaining` scade cu 1. Modelul dominant în centrele de muzică, limbi, dans — ~60% din clienți.

## User stories

- Ca manager, vreau să creez un pachet de 10 lecții pentru un student la o grupă, legat de o factură.
- Ca manager, vreau să văd în timp real câte lecții mai are studentul rămase în pachet.
- Ca student, vreau să văd soldul de lecții rămase în portalul meu.

## Criterii de acceptare

- [ ] Tabel `lesson_packages`: `id uuid PK`, `tenantId uuid FK`, `studentId uuid FK → students`, `courseId uuid FK → courses`, `invoiceId uuid FK null → invoices`, `unitsTotal integer NOT NULL`, `unitsRemaining integer NOT NULL`, `validFrom date NOT NULL`, `validUntil date null`, `autoRenew boolean default false`, `status enum('active','exhausted','expired','cancelled') default 'active'`, `createdAt`, `updatedAt`
- [ ] `POST /api/lesson-packages` → creare pachet; validare `unitsRemaining <= unitsTotal`
- [ ] `GET /api/lesson-packages?studentId=:id&tenantId=:tid` → lista pachete active
- [ ] `GET /api/lesson-packages/:id` → detalii pachet individual
- [ ] Badge „X lecții rămase" vizibil pe cardul studentului din StudentsPage
- [ ] Alertă automată (notificare in-app + coadă COMM-205) când `unitsRemaining <= 2`
- [ ] Pachete vizibile în portalul student (GAP-010 — dacă nu e implementat, endpoint pregătit)
- [ ] `db:reset && db:seed` trece cu date demo (cel puțin un pachet per student demo)

## Fișiere implicate

- `server/db/schema/index.ts` — import tabel nou
- `server/db/schema/lesson_packages.ts` — tabel nou
- `server/routes/lesson-packages.ts` — CRUD endpoints
- `src/pages/app/StudentsPage.tsx` — badge sold unități

## Teste

- Unit: `POST` crează pachet cu `unitsRemaining = unitsTotal`
- Unit: `unitsRemaining > unitsTotal` → 400 Bad Request
- Unit: alertă generată când `unitsRemaining <= 2`
- Smoke: badge vizibil pe student cu pachet activ

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. `db:reset && db:seed` trece. PR pe branch `feat/GAP-faza-2-abonamente-waitlist`.
