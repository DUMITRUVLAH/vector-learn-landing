---
id: GAP-020
title: "Clasament (leaderboard) — top elevi per badge-count + tendință lunară"
milestone: GAP
phase: 6
priority: P2
slug: leaderboard
depends_on: [GAP-019]
status: pending
---

# GAP-020 — Clasament (leaderboard)

## Goal

Managerul vede top-10 elevi după număr de insigne, pe o pagină dedicată `/app/gamification`.
Pagina afișează și tendința față de luna trecută (pozitiv/negativ/neutru). Simplu, fără XP
sau competiție în timp real. Motivație: directorul vrea să laude public elevii campioni la
ședința lunară — are nevoie de un top rapid.

## In scope

- **API endpoint nou:** `GET /api/badges/leaderboard?limit=10` → top elevi după count(badge_type):
  ```
  [{ rank, studentId, studentName, badgeCount, changeFromLastMonth }]
  ```
  - `changeFromLastMonth` = badgeCount azi − badgeCount acum 30 zile (dacă 0 badge-uri în
    urmă cu 30 zile, nu există un snapshot — calculăm badge-urile acordate în ultimele 30 zile
    ca "+N" sau 0)
  - Tenant-scoped; limit default 10, max 50
  - Răspuns sortat DESC după badgeCount, cu rank 1 = cel mai multe badge-uri

- **UI — pagina `/app/gamification` (GamificationPage):**
  - Tabel cu coloane: Rang (#), Elev, Insigne, Tendință (+ verde / − roșu / = gri)
  - Click pe elev → navighează la `/app/students/:id`
  - Buton "Reîncarcă" → refresh leaderboard
  - Card mic cu stastistici globale: total badge-uri acordate, nr. elevi cu ≥1 badge, badge cel mai comun
  - Design system: semantic tokens only; dark mode funcțional

- **Link în sidebar** (AppShell) sub secțiunea "Elevi": "Clasament" → `#/app/gamification`

- **DB:** fără raw `.execute().rows`; query builder sau `Array.isArray(r) ? r : r.rows`
- **TypeScript strict:** zero `any`

## Out of scope

- Leaderboard public (fără auth)
- Filtrare pe perioadă custom (lunar e suficient)
- Animații de celebrare (confetti etc.)
- Notificări la top position

## Acceptance criteria

- [ ] `GET /api/badges/leaderboard` → 200 array sortat DESC cu rank, studentName, badgeCount, changeFromLastMonth
- [ ] `limit` param respectat; max 50
- [ ] Pagina `/app/gamification` → 200 cu tabelul leaderboard
- [ ] Click pe elev în tabel → navighează la `/app/students/:id`
- [ ] Card statistici globale afișat (total badges, elevi cu badge, badge comun)
- [ ] Link "Clasament" în AppShell sidebar prezent și funcțional
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious

## Tests

- **T-GAP-020-1** `[blocant]` Given DB cu student_badges, When GET /api/badges/leaderboard, Then 200 JSON array sortat DESC după badgeCount cu câmpurile rank, studentId, studentName, badgeCount
- **T-GAP-020-2** `[blocant]` Given limit=3, When GET /api/badges/leaderboard?limit=3, Then max 3 rezultate returnate
- **T-GAP-020-3** `[blocant]` API smoke: login + GET /api/badges/leaderboard → 200 JSON
- **T-GAP-020-4** `[normal]` Pagina GamificationPage randează fără crash (smoke render)
- **T-GAP-020-5** `[normal]` Cardul statistici globale afișează total_badges, students_with_badges, top_badge_type
- **T-GAP-020-6** `[normal]` Link "Clasament" prezent în AppShell sidebar (aria-label sau text "Clasament")

## DoD

Standard CLAUDE.md §0.2. Faza 6 branch: `feat/GAP-faza-6-gamificare`. Un PR per fază.
