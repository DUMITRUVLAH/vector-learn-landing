---
id: COURSE-103
title: "Student enrollment into groups + auto-payment creation"
milestone: COURSE
phase: "1"
status: pending
depends_on: [COURSE-102]
---

## Goal

Allow a manager to enroll a student into a group. Enrollment:
1. Creates a `group_enrollments` record (student↔group).
2. Optionally auto-creates a payment draft based on the course's `defaultPriceCents`.
3. Blocks enrollment when the group is at capacity.
4. Sends a parent notification (via existing COMM module).

Also adds a "Groups" tab on the student profile so teachers/managers see which groups the student belongs to.

## User stories

- Ca Manager, vreau să asignez un elev la o grupă, pentru că apare în lista lecțiilor profesorului și plata se creează automat.
- Ca Recepționer, vreau să văd câte locuri rămase are fiecare grupă la înrolare, pentru că consiliez corect părintele.
- Ca Manager, vreau să primesc eroare dacă încerc să înrolez un elev într-o grupă plină, pentru că regulile de capacitate sunt respectate automat.
- Ca Părinte, vreau să primesc notificare cu detalii grupă (zi, oră, profesor), pentru că știu când să îl aduc pe copil.

## Acceptance criteria

- [ ] New table `group_enrollments` (id uuid PK, tenant_id FK, group_id FK, student_id FK, enrolled_at timestamp, status varchar(16) default 'active', notes text, created_at)
- [ ] Unique constraint: `(group_id, student_id)` — cannot enroll same student twice
- [ ] Migration: `<next>_course103_enrollments.sql`
- [ ] `POST /api/groups/:groupId/enroll` — body `{ studentId, createPayment?: boolean }`:
  - Validates group belongs to tenant, student belongs to tenant
  - Checks capacity: if enrolled count >= max_students → 409 `{ error: "group_full" }`
  - Inserts `group_enrollments` record
  - If `createPayment=true`: inserts payment draft (status='pending', amountCents=course.defaultPriceCents)
  - Triggers notification to student's parentEmail via existing message queue
  - Returns `{ enrollment, payment? }`
- [ ] `DELETE /api/groups/:groupId/enroll/:studentId` — soft-remove (status='removed'); does NOT delete payment
- [ ] `GET /api/groups/:groupId/enrollments` — list enrolled students with payment status
- [ ] `GET /api/students/:studentId/groups` — list groups student is enrolled in
- [ ] UI: Student profile page `/app/students/:id` gets "Grupe" tab showing enrolled groups with course+schedule
- [ ] UI: Groups detail page → "Elevi înrolați" tab with student list + enroll button
- [ ] Enroll modal — student picker (search), `createPayment` checkbox (checked by default), submit
- [ ] Capacity guard displayed: "X locuri rămase" — disabled enroll button when 0
- [ ] Unenroll: confirm dialog "Dezînrolezi pe [Nume] din [Grupă]? Plata NU se anulează automat."

## Files to create/modify

### Backend
- `server/db/schema/groupEnrollments.ts` — new table
- `server/db/schema/index.ts` — export groupEnrollments
- `drizzle/<next>_course103_enrollments.sql`
- `server/routes/groups.ts` — add enroll/unenroll endpoints, enrollments list
- `server/routes/students.ts` — add GET /:id/groups endpoint

### Frontend
- `src/pages/app/StudentDetailPage.tsx` — tabs layout with "Grupe" tab
- `src/components/app/EnrollModal.tsx`
- `src/components/app/StudentGroupsList.tsx`
- `src/components/app/GroupEnrollmentsList.tsx`

### Tests
- `src/__tests__/enrollments.test.ts`

## Tests

- **T-COURSE-103-1** [blocant] Given migration applied, When `npm run db:reset && npm run db:seed`, Then `group_enrollments` table exists
- **T-COURSE-103-2** [blocant] Given server booted, When POST /api/auth/login + POST /api/groups/:id/enroll with valid student, Then 201 enrollment created
- **T-COURSE-103-3** [blocant] Given group at capacity (enrolled=max_students), When POST /api/groups/:id/enroll, Then 409 `{error:"group_full"}`
- **T-COURSE-103-4** [blocant] Given result from POST /api/groups/:id/enroll, When accessed as `Array.isArray(r) ? r[0] : r`, Then shape is correct (no raw .execute().rows)
- **T-COURSE-103-5** [normal] Given student enrolled in 2 groups, When GET /api/students/:id/groups, Then both groups returned
- **T-COURSE-103-6** [normal] Given duplicate enrollment attempt (same student, same group), When POST again, Then 409 conflict

## Definition of Done

- Migration committed, `db:reset` + `db:seed` pass
- Capacity guard tested (409 when full)
- Notification triggered to parentEmail
- All acceptance criteria checked
- Reviewer APPROVED, integration-architect CONNECTED
- Personas reviewed
- PR on same `feat/COURSE-faza-1-management` branch
