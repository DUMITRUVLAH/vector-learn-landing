# SCHED-502 Integration Architecture Review

**Date**: 2026-05-30
**Verdict**: CONNECTED

## Module connectivity

### DB layer
- `lesson_series` table: tenant-scoped, weekly recurrence, label, day_of_week, occurrences count
- `lessons.series_id` nullable FK → `lesson_series.id` ON DELETE SET NULL (deleting a series doesn't cascade-delete individual lessons; they become standalone)
- Migration 0015 committed, journal updated, snapshot generated

### API layer
- `POST /api/lessons/recurring` → `{ series: LessonSeries, lessons: Lesson[] }` (201) or `{ error: "conflicts", conflicts: [...] }` (409)
- `DELETE /api/lessons/series/:id/future?from=ISO` → `{ cancelledCount, cancelledIds }` (200) or 404
- Routes registered at `/api/lessons` prefix in `app.ts`

### Cross-module data flow
- Recurring endpoint reuses same conflict detection pattern as lessons route (teacher + room conflict)
- `lessonSeries` imported from schema in `recurring.ts` route
- All lessons created with correct `tenantId`, `seriesId`, and FK-valid `courseId`/`teacherId`/`roomId`
- SchedulePage fetches lessons with `fetchAll()` which includes new recurring lessons in the weekly view automatically (they appear as normal lessons in the grid)

### UI wiring
- "Repetă" button in `SchedulePage` toolbar opens `RecurringModal`
- `RecurringModal` uses same `Teacher[]`, `Course[]`, `Room[]` state already loaded by `SchedulePage.fetchAll()`
- On save: calls `fetchAll()` to refresh the calendar view
- Error code `conflicts` mapped to user-visible Romanian message

### Tenant safety
- Series creation: `tenantId` from auth injected
- Series lookup: `eq(lessonSeries.tenantId, tenantId)` guard before cancel
- All lesson inserts: `tenantId` always present

## Gap analysis
No gaps. All acceptance criteria wired end-to-end. The "Edit this and all following" workflow is out of scope per spec (SCHED-502 out-of-scope section).
