---
id: GAP-018
title: Bibliotecă fizică (inventar materiale)
milestone: GAP
phase: 5
priority: LOW
status: pending
dependencies: [students, tenants]
feeds_into: [GAP-010]
branch: feat/GAP-faza-5-operational
---

## Scop

Modul simplu de inventar pentru manuale și materiale fizice: emitere/returnare per student, stoc, transfer între filiale, istoric. Înlocuiește caietul fizic.

## Criterii de acceptare

- [ ] Tabel `library_items`: `id uuid PK`, `tenantId uuid FK`, `title varchar`, `author varchar null`, `isbn varchar null`, `totalCopies integer default 1`, `availableCopies integer default 1`, `locationBranchId uuid null`, `createdAt`, `updatedAt`
- [ ] Tabel `library_loans`: `id uuid PK`, `tenantId uuid FK`, `itemId uuid FK → library_items`, `studentId uuid FK → students`, `loanedAt timestamp`, `dueDate date`, `returnedAt timestamp null`, `createdAt`
- [ ] `POST /api/library/loans` → emitere (scade `availableCopies`)
- [ ] `PATCH /api/library/loans/:id/return` → returnare (crește `availableCopies`)
- [ ] `GET /api/library/items?studentId=` → lista materialelor împrumutate de un student
- [ ] Pagină `/app/library` cu tabel inventar + formulare emitere/returnare
- [ ] Alertă in-app pentru materiale nereturnate la `dueDate` (cron sau lazy)

## Fișiere implicate

- `server/db/schema/library_items.ts` — tabel nou
- `server/db/schema/library_loans.ts` — tabel nou
- `server/routes/library.ts` — CRUD
- `src/pages/app/LibraryPage.tsx` — pagina nouă

## Teste

- Unit: emitere scade `availableCopies`; returnare crește
- Unit: emitere când `availableCopies = 0` → 409 Conflict
- Smoke: LibraryPage renderizează fără crash

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. PR pe branch `feat/GAP-faza-5-operational`.
