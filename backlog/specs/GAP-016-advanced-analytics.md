---
id: GAP-016
title: "Analytics avansat — retenție, venituri per profesor, prognoza churn"
milestone: GAP
phase: 5
priority: P2
slug: advanced-analytics
depends_on: [REP-301, REP-302, REP-303]
status: pending
---

# GAP-016 — Analytics avansat

## Goal

Paginile de analytics existente (REP-301..304) afișează KPI-uri agregate. Acest item adaugă
trei panouri noi pe `/app/analytics`: **retenție per curs**, **venituri per profesor** și
**scor de risc churn** per student (bazat pe absențe + trend plăți). Fără backend nou de ML —
totul e calculat cu SQL agregat.

## In scope

- **API endpoint nou:** `GET /api/analytics/retention-by-course` → per curs: nr. studenți
  activi azi vs. acum 30 zile, retenție % = (activi azi / activi acum 30) * 100.
  "Activ" = cel puțin o lecție în ultimele 30 zile. Tenant-scoped.

- **API endpoint nou:** `GET /api/analytics/revenue-by-teacher` → per teacher: suma
  `invoices.amountCents` where `status = paid` și `lessons.teacherId = teacher.id` în ultimele
  30 zile. Join: `invoices` → student → `student_lessons` → `lessons`. Tenant-scoped.

- **API endpoint nou:** `GET /api/analytics/churn-risk` → top 20 studenți cu risc churn:
  - absențe nemotivate ≥ 3 în ultimele 30 zile SAU
  - nicio lecție în ultimele 14 zile SAU
  - datorie > 0 + ultima plată > 30 zile
  - Returnează: `{ studentId, name, riskScore (0-100), reasons[] }`. Score simplu: suma
    flag-urilor × pondere (absențe=40, inactivitate=35, datorie=25). Tenant-scoped.

- **UI — `/app/analytics` (AnalyticsPage.tsx sau pagina existentă de analytics):**
  - Panou "Retenție per curs": tabel sortabil curs/retenție%, trending up/down badge
  - Panou "Venituri per profesor": bar chart sau tabel (valoare RON + nr. lecții)
  - Panou "Risc churn": top 10 studenți cu scor de risc + motive + link la student page

- **DB:** fără raw `.execute().rows`; query builder; JOIN-uri compatibile PostgreSQL + PGlite
  (nu `ILIKE` specific, folosiți `lower()` dacă trebuie filtrare text)

- **TypeScript strict:** zero `any`

## Out of scope

- ML real / modele predictive
- Date istorice multi-an (fereastră: ultimele 30 zile fixă)
- Export CSV al analytics (REP-304 există)
- Notificări automate la churn-risk (COMM separat)

## Acceptance criteria

- [ ] `GET /api/analytics/retention-by-course` → 200 cu array per curs (poate fi gol)
- [ ] `GET /api/analytics/revenue-by-teacher` → 200 cu array per teacher
- [ ] `GET /api/analytics/churn-risk` → 200 cu top studenți riscanti (poate fi gol)
- [ ] Panourile UI randează fără crash pe `/app/analytics`
- [ ] DB: zero `.execute().rows` raw; toate queries prin query builder
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious
- [ ] Build + typecheck + lint verde

## Tests

- **T-GAP-016-1** `[blocant]` Given studenți cu lecții în ultimele 30 zile, When `GET /api/analytics/retention-by-course`, Then 200 cu array incluzând `retentionPct` numeric
- **T-GAP-016-2** `[blocant]` Given invoices plătite legate de teachers, When `GET /api/analytics/revenue-by-teacher`, Then 200 cu `revenueRon` per teacher
- **T-GAP-016-3** `[blocant]` Given student cu 3+ absențe nemotivate, When `GET /api/analytics/churn-risk`, Then student apare în listă cu `riskScore > 0` și `reasons` conținând absente
- **T-GAP-016-4** `[blocant]` API smoke: login + `GET /api/analytics/retention-by-course` → 200 JSON
- **T-GAP-016-5** `[normal]` Panoul "Risc churn" randează fără crash în UI (smoke render)
- **T-GAP-016-6** `[normal]` Dacă DB gol, toate 3 endpoints returnează 200 cu array gol (nu 500)

## DoD

Standard CLAUDE.md §0.2. Faza 5 branch: `feat/GAP-faza-5-operational`. Un PR per fază.
No migration needed (analytics is read-only queries on existing tables).
