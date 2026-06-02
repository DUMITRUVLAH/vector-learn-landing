# SCHOOL-001 — Integration Architect Review

**Verdict: CONNECTED**

## Schema connections verified
- `academic_years.tenantId` → `tenants.id` (cascade) ✓
- `academic_terms.academicYearId` → `academic_years.id` (cascade) ✓
- `school_classes.tenantId` → `tenants.id` (cascade) ✓
- `school_classes.academicYearId` → `academic_years.id` (cascade) ✓
- `school_classes.homeroomTeacherId` → `teachers.id` (set null) ✓
- `class_enrollments.classId` → `school_classes.id` (cascade) ✓
- `class_enrollments.studentId` → `students.id` (cascade) ✓
- Unique constraint: `(classId, studentId)` prevents double enrollment ✓

## Tenant safety
- Every route uses `eq(table.tenantId, user.tenantId)` ✓
- Cross-tenant checks: year ownership verified before class creation ✓
- Teacher ownership verified before assigning as homeroom teacher ✓

## API wiring
- Routes registered in app.ts at line 125 ✓
- Mounted before end of app — Hono resolves correctly ✓
- Route path `/api/school` doesn't conflict with existing routes ✓

## Migration
- Prefix 0028 > 0027 (max on main) ✓
- Manual SQL migration — only adds new tables ✓
- `db:reset && db:seed` → ✓

## Cross-module data flow (future)
- SCHOOL-003 will link `attendance_sessions.classId` → `school_classes.id`
- SCHOOL-002 will link `grade_entries.classId` → `school_classes.id`
- SCHOOL-004 tuition will link to `class_enrollments` ✓ (foundation is solid)

## DB portability
- All queries use `Array.isArray(rows) ? rows : rows.rows ?? rows` pattern ✓
- No raw `.execute().rows` ✓

## Gaps / future work
- `GET /api/school/classes/:id/enrollments` endpoint needed to list enrolled students
  (currently only count is returned). Will be needed by SCHOOL-003.
