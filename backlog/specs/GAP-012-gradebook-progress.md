---
id: GAP-012
title: "Gradebook / rapoarte de progres elev — skill-uri, milestones, vizibil părinților"
milestone: GAP
phase: 4
priority: P2
slug: gradebook-progress
depends_on: [MVP-004, MVP-005]
status: pending
---

# GAP-012 — Gradebook + rapoarte de progres elev

## Goal

Profesorii pot înregistra note/evaluări per lecție sau per perioadă, asociate cu skill-uri
definite pe curs. Managerul vede un tablou de bord cu progresul pe cohortă. Un link public
per student (token) permite părinților să vadă evoluția copilului fără cont.

## In scope

- **Schema nouă:** tabele `progress_skills`, `progress_entries`  (tenant-scoped)
  - `progress_skills`: `id, tenant_id, course_id, name, description, sort_order`
  - `progress_entries`: `id, tenant_id, student_id, skill_id, lesson_id (nullable), score (0–100), comment, evaluated_by (teacher_id), evaluated_at`
- **CRUD skills** (`/app/progress/skills`): manager definește skill-urile unui curs (ex. "Pronunție", "Vocabular", "Gramatică")
- **Log progres** — pe pagina studentului (`/app/students/:id`), tab "Progres":
  - tabel cu ultima evaluare per skill + trend (↑↓ față de evaluarea anterioară)
  - buton „Adaugă evaluare" (modal: skill, score, comentariu)
- **Raport progres student** — `GET /api/progress/students/:studentId` → array de skills cu
  ultimul score + istoric evaluări. Tenant-scoped.
- **Link public per student** — `GET /api/progress/public/:token` (token generat din
  `students.id` + secret; no-auth) → returnează skill-urile + evaluările ultimei perioade.
  UI: `/progress/:token` (React page, no-auth).
- **Endpoints autentificate:**
  - `GET /api/progress/skills?courseId=` — lista skills unui curs
  - `POST /api/progress/skills` — crează skill (manager)
  - `DELETE /api/progress/skills/:id` — șterge skill dacă fără evaluări
  - `GET /api/progress/students/:studentId` — progres complet
  - `POST /api/progress/entries` — body: `{ studentId, skillId, lessonId?, score, comment }` (teacher/manager)
  - `GET /api/progress/public/:token` — no-auth, token HMAC-SHA256
- **DB:** fără raw `.execute().rows`; query builder cu wrapper de portabilitate

## Out of scope

- PDF export al raportului (va fi DIPLOMA-806 dacă necesar)
- Trimitere automată email (manual, link copiat)
- Grile comparative cu alți studenți

## Acceptance criteria

- [ ] Pagina `/app/progress/skills` — CRUD skill-uri per curs
- [ ] Tab "Progres" pe `/app/students/:id` — lista ultimelor evaluări per skill + trend
- [ ] Modal „Adaugă evaluare" funcțional — skill + score 0–100 + comentariu → salvat
- [ ] `GET /api/progress/students/:studentId` → JSON cu skills + entries
- [ ] `GET /api/progress/public/:token` → no-auth, 200 cu raport, 401 dacă token invalid
- [ ] Pagina publică `/progress/:token` randează fără crash
- [ ] Migrare `progress_skills` + `progress_entries` commitată; `db:reset + db:seed` succed
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK; mobil-friendly
- [ ] TypeScript strict; zero `any`

## Tests

- **T-GAP-012-1** `[blocant]` Given skill creat pentru curs, When `POST /api/progress/entries` cu score valid, Then 201 + entry salvat
- **T-GAP-012-2** `[blocant]` Given token valid, When `GET /api/progress/public/:token`, Then 200 cu skills + ultimele scores
- **T-GAP-012-3** `[blocant]` Given token invalid, When `GET /api/progress/public/:token`, Then 401
- **T-GAP-012-4** `[blocant]` Migration gate: `db:reset + db:seed` succed cu noile tabele
- **T-GAP-012-5** `[blocant]` Multi-tenant: evaluările tenantului A nu sunt vizibile tenantului B
- **T-GAP-012-6** `[normal]` Given student cu 2 evaluări pentru același skill, When `GET /api/progress/students/:id`, Then trend calculat corect (↑ dacă score2 > score1)
- **T-GAP-012-7** `[normal]` Pagina `/app/students/:id` tab "Progres" randează fără crash

## DoD

Standard. O fază = 1 PR (CLAUDE.md §0.2). Faza 4 branch: `feat/GAP-faza-4-analytics`.
