---
id: GAP-019
title: "Gamificare — insigne (badges) per elev: lecții, prezență, teme"
milestone: GAP
phase: 6
priority: P2
slug: gamification-badges
depends_on: [GAP-015, SCHED-503]
status: pending
---

# GAP-019 — Insigne (badges) de gamificare

## Goal

Elevii primesc insigne automate (badges) când ating jaloane: prime 10 lecții, 30 zile de
prezenț consecutivă, 5 teme predate etc. Managerul vede badge-urile unui elev pe card-ul
lui. Elevul le vede în portalul student (GAP-010). Simplu, fără puncte/XP — doar jaloane
binare vizibile.

## In scope

- **Schema nouă:** `student_badges` (tenant-scoped)
  - `id uuid pk default, tenant_id uuid FK tenants cascade,`
  - `student_id uuid FK students cascade,`
  - `badge_type varchar(50) not null` — enum: `first_lesson | ten_lessons | first_homework |`
    `five_homework | thirty_day_streak | perfect_week | hundred_lessons`
  - `awarded_at timestamptz not null defaultNow()`
  - `awarded_reason text` — human-readable description (EN)
  - constraint unique(tenant_id, student_id, badge_type) — un badge per tip per elev

- **Migrare:** `0033_gap019_badges.sql` — prefix 33

- **Logică de acordare (awarding logic)** — funcție `awardBadgesForStudent(tenantId, studentId, db)`:
  - `first_lesson`: ≥ 1 lecție finalizată (status attended)
  - `ten_lessons`: ≥ 10 lecții finalizate
  - `hundred_lessons`: ≥ 100 lecții finalizate
  - `first_homework`: ≥ 1 temă predată (homework_submissions)
  - `five_homework`: ≥ 5 teme predate
  - `thirty_day_streak`: 30 de zile consecutive cu cel puțin o lecție attended (simplu: nr. zile
    unice cu lecție în ultimele 30 = 30)
  - `perfect_week`: 5 zile distincte cu lecție în ultima săptămână calendaristică
  - Funcția face upsert (ignoreaza dupele via unique constraint): dacă badge-ul nu există
    și condiția e îndeplinită → insert. Dacă există → skip.
  - Apelată din POST /api/badges/check (manual trigger) și din POST attended-hook (GAP-018 check-in).

- **API routes (autentificate, tenant-scoped):**
  - `GET /api/badges/students/:studentId` → lista badge-urilor elevului (array cu badge_type, awarded_at, awarded_reason)
  - `POST /api/badges/check/:studentId` → rulează awarding logic pentru studentul dat; returnează `{ awarded: BadgeType[] }` — lista badge-urilor nou acordate în acest apel

- **UI — secțiune "Insigne" pe `/app/students/:id` (pagina StudentPage):**
  - Grid de badge-icons: insigne câștigate = colorate + tooltip cu data; insigne necâștigate = gri opacity-40
  - Buton "Actualizează insigne" → POST /api/badges/check/:studentId → refresh
  - 7 badge-uri definite: First Lesson, 10 Lessons, 100 Lessons, First Homework, 5 Homework, 30-Day Streak, Perfect Week
  - Design system: semantic tokens only (bg-primary, text-muted-foreground etc.), zero hex
  - Dark mode: funcționează fără hardcoded colors

- **DB:** fără raw `.execute().rows`; query builder sau `Array.isArray(r) ? r : r.rows`
- **TypeScript strict:** zero `any`

## Out of scope

- Puncte (XP) / clasament global (GAP-020)
- Push notifications la badge nou (COMM mai târziu)
- Badge-uri customizate de manager
- Animații CSS avansate (simplu este suficient)

## Acceptance criteria

- [ ] `GET /api/badges/students/:studentId` → 200 array (poate fi gol)
- [ ] `POST /api/badges/check/:studentId` → 200 `{ awarded: [...] }`; re-check nu mai acordă același badge (idempotent)
- [ ] `awardBadgesForStudent` acordă `first_lesson` la primul check după ≥1 lecție finalizată
- [ ] `awardBadgesForStudent` acordă `first_homework` la primul check după ≥1 temă predată
- [ ] Secțiunea "Insigne" pe StudentPage randează cu 7 badge slots (câștigate + necâștigate)
- [ ] Migrare `0033_gap019_badges.sql` commitată; `db:reset + db:seed` succed
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious

## Tests

- **T-GAP-019-1** `[blocant]` Given student cu ≥1 lecție finalizată (status attended), When POST /api/badges/check/:studentId, Then 200 cu `awarded` conținând `first_lesson`; al doilea apel → `awarded: []` (idempotent)
- **T-GAP-019-2** `[blocant]` Given student cu ≥1 temă predată, When POST /api/badges/check/:studentId, Then `awarded` conține `first_homework`
- **T-GAP-019-3** `[blocant]` Given orice student, When GET /api/badges/students/:studentId, Then 200 JSON array (câmpuri: badge_type, awarded_at, awarded_reason)
- **T-GAP-019-4** `[blocant]` Migration gate: `db:reset + db:seed` succed; `0033_gap019_badges.sql` prezent în drizzle/
- **T-GAP-019-5** `[blocant]` API smoke: login + POST /api/badges/check/:studentId → 200 JSON
- **T-GAP-019-6** `[normal]` Secțiunea "Insigne" pe StudentPage randează fără crash cu grid de 7 badge slots
- **T-GAP-019-7** `[normal]` Badge câștigat apare colorat; badge necâștigat apare gri (opacity-40)

## DoD

Standard CLAUDE.md §0.2. Faza 6 branch: `feat/GAP-faza-6-gamificare`. Un PR per fază (include GAP-019 + GAP-020).
