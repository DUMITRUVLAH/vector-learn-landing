# SCHED-501 Integration Architecture Review

**Date**: 2026-05-30
**Verdict**: CONNECTED

## Module connectivity

### DB layer
- `rooms` table: tenant-scoped, `name`, `capacity`, `description`
- `lessons.room_id` FK → `rooms.id` ON DELETE SET NULL (correct: deleting a room doesn't cascade-delete lessons, just nulls the room reference)
- Migration 0014 committed and in `drizzle/_journal.json`

### API layer
- `GET /api/rooms` → returns `{ items: Room[] }` — consistent with other list endpoints
- `POST /api/rooms` → returns created room (201)
- `PATCH /api/rooms/:id` → partial update, 404 if not found
- `DELETE /api/rooms/:id` → soft delete by tenant-scoped filter
- Conflict endpoint wired into `POST /api/lessons` and `PATCH /api/lessons/:id`

### Cross-module data flow
- Lessons module correctly imports `rooms` schema for conflict detection
- `findRoomConflict()` reuses the same pattern as `findConflict()` (teacher conflict) — consistent
- `createLesson()` client helper updated to accept `roomId` optional param
- UI (SchedulePage) passes `roomId: roomId || null` correctly

### UI wiring
- `SchedulePage` fetches rooms in `fetchAll()` alongside lessons/teachers/courses
- Room dropdown shown conditionally only if `rooms.length > 0` (graceful when no rooms configured)
- Error code `room_double_booked` properly mapped to user-visible message in Romanian

### Tenant safety
- All operations scoped to `tenantId` from auth context
- No cross-tenant data leakage possible

## Gap analysis
No gaps found. All acceptance criteria connected end-to-end.
