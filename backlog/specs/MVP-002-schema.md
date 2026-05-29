---
id: MVP-002
title: Database schema — tenants, users, students, teachers, lessons
milestone: MVP
estimate_hours: 2
priority: P0
---

# MVP-002 — Database schema

## Goal
Definește schema completă pentru un MVP funcțional: multi-tenant (un cont = un tenant = o academie), user-uri cu roluri, students, teachers, courses, lessons, attendance, payments stub.

## Schema

```typescript
// tenants — o academie
tenants: id, name, slug, plan, created_at, updated_at

// users — pot fi staff (admin/manager/teacher/receptionist) sau student
users: id, tenant_id, email, password_hash, name, role, created_at

// students — elevii înrolați
students: id, tenant_id, full_name, phone, email, parent_phone, parent_email,
          birth_date, status, created_at, updated_at

// teachers — link la users role=teacher
teachers: id, tenant_id, user_id, hourly_rate_cents, commission_pct, created_at

// courses — disciplinele/cursurile oferite
courses: id, tenant_id, name, description, level, default_price_cents,
         duration_minutes, created_at

// lessons — instanțe de lecție
lessons: id, tenant_id, course_id, teacher_id, scheduled_at, duration_minutes,
         status, meeting_url, created_at, updated_at

// student_lessons — many-to-many între elevi și lecții
student_lessons: id, tenant_id, lesson_id, student_id, attendance_status,
                 marked_by, marked_at, created_at

// payments — stub (real Stripe integration later)
payments: id, tenant_id, student_id, amount_cents, currency, status,
          paid_at, created_at
```

## Acceptance criteria
- [ ] Drizzle schema în `server/db/schema/` cu un fișier per tabel (sau grup logic)
- [ ] Toate tabelele au `id UUID PRIMARY KEY` și `tenant_id` (row-level multi-tenancy)
- [ ] Indexes pe `tenant_id` + foreign keys
- [ ] `npm run db:generate` produce migrația
- [ ] `npm run db:migrate` o aplică curat
- [ ] Seed script `npm run db:seed` populează un tenant demo cu 1 admin + 3 profesori + 20 elevi + 5 lecții
- [ ] Endpoint `/api/health/db` returnează `{ tables: 8, demo_tenant: true }`

## Files
- `server/db/schema/index.ts`
- `server/db/schema/tenants.ts`
- `server/db/schema/users.ts`
- `server/db/schema/students.ts`
- `server/db/schema/teachers.ts`
- `server/db/schema/courses.ts`
- `server/db/schema/lessons.ts`
- `server/db/schema/payments.ts`
- `server/db/seed.ts`
- `drizzle/0001_schema.sql`

## DoD
Schema rulează, seed creează tenant demo, `/api/health/db` confirmă.
