---
id: MVP-005
title: Lessons + courses + teachers CRUD with real schedule view
milestone: MVP
estimate_hours: 3
priority: P0
---

# MVP-005 — Lessons + Schedule

## Goal
Backend API + frontend pentru gestiunea lecțiilor: list, create, update, delete, plus dropdown pentru courses și teachers. Frontend înlocuiește demo-ul drag-drop cu un orar săptămânal real care arată lecțiile din DB cu detectarea conflictelor server-side.

## Acceptance criteria
- [ ] `/api/teachers` — GET list, returnează cu user join (name, email)
- [ ] `/api/courses` — GET list + POST create
- [ ] `/api/lessons` — GET (filtru by date range), POST, PATCH, DELETE
- [ ] Detectare conflict server-side: same teacher + overlapping time → 409
- [ ] Frontend `/app/schedule` cu week view (5 zile × 4 sloturi)
- [ ] Click pe slot gol → modal "Add lesson" cu course + teacher + duration
- [ ] Click pe lecție → modal cu detalii + delete
- [ ] Toate persistente în DB, tenant-scoped
