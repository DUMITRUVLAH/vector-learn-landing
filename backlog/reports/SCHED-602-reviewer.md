# SCHED-602 — Code Review

**Verdict: APPROVED**

## API
- `PATCH /api/lessons/:id/substitute` — clean, validates teacher belongs to tenant, runs `findConflict` with excludeLessonId, writes audit log
- `GET /api/teachers/available?lessonId=<id>` — correct: fetches busy teacher IDs in the slot, then excludes from full list
- Error codes: `teacher_double_booked (409)`, `lesson_cancelled (422)`, `teacher_not_found (404)`, `lesson_not_found (404)` — all appropriate

## UI
- `SubstituteTeacherModal` — nested modal (z-[60] > parent z-50) renders correctly
- Loading state while fetching available teachers
- Empty state when no teachers available
- Correct aria labels on dialog

## Design system
- `UserCog` icon — meaningful
- All classes semantic tokens

## Zero `any` — confirmed
## No migration needed (no schema changes) — confirmed
