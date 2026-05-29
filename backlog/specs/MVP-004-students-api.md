---
id: MVP-004
title: Students CRUD — API + UI dashboard
milestone: MVP
estimate_hours: 2
priority: P0
---

# MVP-004 — Students CRUD

## Goal
Primul modul real funcțional end-to-end. Manager autentificat poate vedea, crea, edita, șterge elevii centrului său. Date persistente în Postgres, izolate per tenant.

## Acceptance criteria
- [ ] `GET /api/students` listă paginată, filtrabilă (search, status)
- [ ] `POST /api/students` creează cu validare Zod (nume obligatoriu, telefon format)
- [ ] `GET /api/students/:id` returnează detaliu
- [ ] `PATCH /api/students/:id` editează parțial
- [ ] `DELETE /api/students/:id` soft delete (set status='archived')
- [ ] Toate endpoint-urile protected (requireAuth + tenant scope)
- [ ] Frontend: `/app/students` cu tabel real (nu hardcoded), search live, paginare
- [ ] Frontend: drawer "Add student" + edit cu form Zod-validated
- [ ] Confirm dialog pe delete
- [ ] Toast feedback la succes/eroare
- [ ] Empty state când 0 elevi
- [ ] Test E2E: signup → login → add 3 students → search → edit → delete

## Files
- `server/routes/students.ts`
- `server/validators/student.ts`
- `src/pages/app/StudentsPage.tsx`
- `src/components/app/StudentForm.tsx`
- `src/components/app/StudentTable.tsx`
- `src/lib/api/students.ts`
- `src/__tests__/api/students.test.ts`

## DoD
End-to-end flow funcționează în browser pe localhost.
