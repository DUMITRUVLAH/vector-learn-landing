---
id: MOB-105
title: Gamification — XP, streaks, badges, leaderboard
milestone: MOB
phase: "1"
status: pending
priority: P1
depends_on: [MOB-102]
spec: backlog/specs/MOB-105-gamification-xp-streaks.md
---

## Goal

Motivate students through XP points (earned per action: attend lesson, submit homework,
complete quiz), consecutive-day streaks with celebration on milestone days (7/30 days),
badges for achievements, and an opt-in class leaderboard showing top 10 by XP.

---

## User stories

- **Ca Elev**, vreau XP pentru prezență + tema completă, pentru că mă simt motivat să vin.
- **Ca Elev**, vreau să păstrez streak-ul de zile consecutive, pentru că îl arăt prietenilor.
- **Ca Elev**, vreau să văd unde sunt în leaderboard-ul clasei (opt-in), pentru că mă compar prietenos.
- **Ca Director**, vreau regulile XP configurabile per centru, pentru că adaptez sistemul la disciplina mea.

---

## Acceptance criteria

1. DB: new table `xp_events` with columns:
   `id UUID PK`, `tenant_id UUID FK`, `student_id UUID FK students(id)`,
   `type VARCHAR(50) NOT NULL` (attendance | homework_submit | quiz_complete | login),
   `amount INT NOT NULL DEFAULT 10`, `description TEXT`,
   `occurred_at TIMESTAMPTZ DEFAULT now()`.
2. DB: new table `student_streaks` with columns:
   `id UUID PK`, `tenant_id UUID FK`, `student_id UUID FK students(id) UNIQUE`,
   `current_streak INT DEFAULT 0`, `longest_streak INT DEFAULT 0`,
   `last_activity_date DATE`, `updated_at TIMESTAMPTZ`.
3. DB: new table `badges` with columns:
   `id UUID PK`, `tenant_id UUID FK`, `student_id UUID FK`,
   `badge_type VARCHAR(50)` (streak_7 | streak_30 | xp_100 | xp_500 | first_homework),
   `earned_at TIMESTAMPTZ DEFAULT now()`.
4. Server utility `lib/xp.ts`:
   - `awardXP(tenantId, studentId, type, amount?)` — inserts xp_event.
   - `updateStreak(tenantId, studentId)` — computes current streak from `last_activity_date`;
     awards streak_7 / streak_30 badges on milestone.
5. Integration hooks: after attendance mark (SCHED-503) → `awardXP(type: 'attendance', 10)`;
   after homework submit → `awardXP(type: 'homework_submit', 20)`.
6. API `GET /api/m/xp` → `{ totalXP, level, currentStreak, longestStreak, badges[], rank }`.
   Level formula: level = floor(totalXP / 100) + 1.
7. UI `/m/xp` page — shows XP bar (progress to next level), streak flame icon with count,
   badge gallery. XP rules configurable note (amounts set in tenant settings stub — can be
   hardcoded defaults for now).
8. Leaderboard `/m/leaderboard` — top 10 students in the same enrolled group by totalXP.
   Opt-in: student must set `leaderboard_opt_in = true` in profile (column on students table).
   Only students who opted in appear; the current student always sees their own rank even if not top 10.
9. Migration `0040_mob105_gamification.sql` committed.
10. `db:reset && db:seed` succeeds.

---

## Files

- `server/db/schema/gamification.ts` — xp_events, student_streaks, badges tables
- `server/db/schema/index.ts` — export
- `drizzle/0040_mob105_gamification.sql` — migration
- `server/lib/xp.ts` — awardXP, updateStreak utilities
- `server/routes/mobile.ts` — GET `/api/m/xp`, GET `/api/m/leaderboard`
- `server/db/schema/students.ts` — add `leaderboard_opt_in BOOLEAN DEFAULT false`
- `src/pages/app/mobile/XpPage.tsx` — new
- `src/pages/app/mobile/LeaderboardPage.tsx` — new
- `src/pages/app/mobile/XpPage.test.tsx` — new
- router — `/m/xp`, `/m/leaderboard`

---

## Tests

- **T-MOB-105-1** `[blocant]` Given migration applied, When `db:reset && db:seed`, Then succeeds.
- **T-MOB-105-2** `[blocant]` Given student token, When GET `/api/m/xp`, Then 200 with `{totalXP, level, currentStreak, badges}`.
- **T-MOB-105-3** `[blocant]` Given `awardXP(type: 'attendance', 10)` called, When xp_events queried, Then record exists with correct amount.
- **T-MOB-105-4** `[normal]` Given student has 7-day streak, When `updateStreak` called on day 7, Then badge `streak_7` awarded.
- **T-MOB-105-5** `[normal]` Given `XpPage` rendered with mock xp data, When component mounts, Then renders XP bar and streak count without crash.
- **T-MOB-105-6** `[normal]` Given leaderboard with opt-in students, When GET `/api/m/leaderboard`, Then only opted-in students returned.

---

## Definition of Done

- [ ] `xp_events`, `student_streaks`, `badges` tables migrated
- [ ] XP + streak utilities working and hooked into attendance/homework flows
- [ ] `/m/xp` and `/m/leaderboard` routes working
- [ ] All T-MOB-105-* tests green
- [ ] Migration gate green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/MOB-faza-1-student-pwa`
