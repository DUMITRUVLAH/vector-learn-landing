# SCHED-503 Integration Report

**Verdict: CONNECTED**

## DB wiring
- `studentLessons` table already in schema (from MVP-002/005) with `markedBy`, `markedAt`, `attendanceStatus` columns
- `markedBy` → FK to `users.id` (set null on delete) — correct
- No new migrations needed — table already exists

## Cross-module data flow
- Lessons → studentLessons → students: all FK-linked, all tenant-scoped
- The GET endpoint joins `students` for name/email — avoids N+1
- The PATCH endpoint uses `db.query.studentLessons.findFirst` (query builder) — DB-portable

## API contracts
- `GET /api/lessons/:id/students` → { items: LessonStudent[] }
- `PATCH /api/lessons/:id/students/:studentId/attendance` → LessonStudent (201 on create, 200 on update)
- 403 on locked lesson for non-admin, 422 if lesson hasn't started, 404 if lesson not found

## Tenant safety
- All queries scoped to `tenantId` from auth session
- Lesson ownership checked before any studentLesson operation

## UI wiring
- `getLessonStudents` and `markAttendance` added to `src/lib/api/lessons.ts`
- `AttendancePanel` mounted in `ViewLessonModal` — renders only after lesson has started
- Error messages surfaced through existing toast system

## Smoke test results
- GET /api/lessons/:id/students → 200 ✓
- PATCH attendance → 201 (auto-enroll) / 200 (update) ✓
- Admin can update locked (>24h) lesson attendance ✓
- 16 unit tests green
