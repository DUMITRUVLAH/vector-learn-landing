---
id: KINDER-003
title: Staff-to-child ratio monitoring — live ratio per room + licensing-limit alerts
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001]
---

## Goal

Daycarele cu licență trebuie să mențină un raport legal personal/copii (ex. 1 educator la max 6
copii sub 2 ani, 1 la 10 pentru 3-5 ani). Dacă raportul este depășit, centrul riscă amendă sau
suspendarea licenței. Adăugăm o configurare a limitei per cameră/grup de vârstă, calculul live
al raportului bazat pe check-in-urile active (KINDER-001) și o alertă vizuală clară când limita
este aproape sau depășită.

## User stories

- Ca manager de grădiniță, vreau să configurez limita legală de copii per educator per cameră, pentru că trebuie să dovedesc inspectorului că respect normele.
- Ca educator de serviciu, vreau să văd în timp real raportul curent per cameră, pentru că dacă se depășește limita trebuie să chem întăriri imediat.
- Ca manager, vreau să primesc o alertă când o cameră se apropie de limita legală, pentru că prefer să acționez preventiv.
- Ca manager, vreau un raport zilnic al raportului minim/maxim per cameră, pentru că am nevoie de dovezi de conformitate pentru inspecții.

## Acceptance criteria

1. Schema: tabelul `ratio_limits` (id, tenant_id, room_id FK → rooms.id, age_group_label VARCHAR, max_children_per_staff INT, created_at). Tabelul `rooms` există deja (SCHED-501).
2. API `GET /api/kinder/ratio/live` — returnează per room: room_name, staff_count_present (din checkin-uri de tip staff — simplifcat: numărul de useri cu rol teacher/staff care au check-in azi), children_count_present (din checkin_log de azi), ratio_limit configurată, status: "ok"|"warning"|"over".
   - "warning" = children_count >= 80% din (ratio_limit × staff_count)
   - "over" = children_count > (ratio_limit × staff_count)
   - Dacă nu există ratio_limit configurată pentru o cameră, returnează status "unconfigured".
3. API `GET /api/kinder/ratio/limits` + `POST /api/kinder/ratio/limits` + `PUT /api/kinder/ratio/limits/:id` + `DELETE /api/kinder/ratio/limits/:id` — CRUD pentru limitele per cameră.
4. UI `KinderRatioPage` (`/app/kinder/ratio`): 3 secțiuni:
   a. **Live status** — carduri per cameră cu indicator colorat (verde/galben/roșu), raport curent "X copii / Y educatori = Z:1" și limita configurată.
   b. **Configurare limite** — tabel editabil cu limitele per cameră, buton Adaugă.
   c. **Alertă vizuală** — banner roșu în header dacă ORICE cameră este în status "over".
5. Migrare SQL: `0030_kinder003_ratio.sql` (doar `ratio_limits` — `rooms` există deja).
6. Route `/app/kinder/ratio` adăugat în `App.tsx` și link în sidebar.
7. `ratio_limits` este scoped by tenant_id (tenant isolation).
8. Test: smoke render fără crash, GET /api/kinder/ratio/live → 200.

## Files

### New
- `server/db/schema/kinderRatio.ts` — `ratio_limits` table
- `server/routes/kinderRatio.ts` — live ratio + limits CRUD
- `src/pages/app/KinderRatioPage.tsx` — ratio monitoring UI
- `src/__tests__/kinder-ratio.test.tsx` — unit tests
- `drizzle/0030_kinder003_ratio.sql` — migration

### Modified
- `server/db/schema/index.ts` — export kinderRatio
- `server/app.ts` — mount ratio routes
- `src/App.tsx` — add `/app/kinder/ratio` route
- `src/components/AppShell.tsx` — ratio link in sidebar

## Tests

- **T-KINDER-003-1** [blocant] Given the app is running, When GET /api/kinder/ratio/live with auth, Then 200 with an array of room ratio objects.
- **T-KINDER-003-2** [blocant] Given a ratio_limits row exists for a room, When children_count > ratio_limit × staff_count, Then GET /api/kinder/ratio/live returns status "over" for that room.
- **T-KINDER-003-3** [blocant] Given KinderRatioPage renders, When component mounts, Then renders without crash.
- **T-KINDER-003-4** [normal] Given POST /api/kinder/ratio/limits with room_id and max_children_per_staff=6, Then GET /api/kinder/ratio/limits returns the new limit.
- **T-KINDER-003-5** [blocant] Given migration 0030 applied, When db:reset runs, Then no error.
- **T-KINDER-003-6** [normal] Given no ratio_limit configured for a room, When GET /api/kinder/ratio/live, Then that room shows status "unconfigured".

## DoD

- [ ] Migration committed (`0030_kinder003_ratio.sql`)
- [ ] `db:reset && db:seed` green
- [ ] API smoke: login + GET /api/kinder/ratio/live → 200
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] On same branch: `feat/KINDER-faza-1-checkin-diary-ratio`
