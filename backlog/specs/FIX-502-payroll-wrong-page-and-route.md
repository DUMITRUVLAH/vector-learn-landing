---
id: FIX-502
title: "BUG: Salarizare — „Nu pot încărca datele de salarizare\" / „Eroare la calculul salarizării\" (pagina greșită montată + API /api/hr/payroll nemontat)"
milestone: AUDIT-FIX
phase: 1
status: pending
depends_on: []
slug: payroll-wrong-page-and-route
---

## Goal

Owner-reported: „Eroare la calculul salarizării" + „Nu pot încărca datele de salarizare". Cauză
confirmată: sub `/business/fin/payroll` se randează **pagina greșită**.

## Root cause (dovezi)
- `src/App.tsx:44` importă `PayrollPage` din **`./pages/app/PayrollPage`** (varianta CRM, HR-401)
  și o montează la `/business/fin/payroll` (App.tsx:134) și `/business/fin/payroll/employees` (App.tsx:108).
- `src/pages/app/PayrollPage.tsx` cheamă (`src/lib/api/payroll.ts`):
  - `GET /api/hr/payroll`
  - `POST /api/hr/payroll/calculate`
  - `PATCH /api/hr/payroll/:id`
- **Niciun `hr/payroll` nu e montat în `server/app.ts`** — singura rută payroll e `finPayrollRoutes`
  la `/api/fin/payroll` (cu shape diferit: `/employees`, `/runs`, `/runs/:id/calculate`, …).
  Deci `/api/hr/payroll*` cade pe SPA fallback → `JSON.parse('<!doctype…')` → catch → mesajele de eroare
  (`src/pages/app/PayrollPage.tsx:75` și `:93`).
- Pagina CORECTĂ pentru FinDesk există deja: `src/pages/fin/PayrollPage.tsx` exportă **`PayrollFINPage`**,
  cheamă `/api/fin/payroll/runs`, `/runs/:id/calculate`, `/runs/:id/confirm` — toate MONTATE.
- Mai există și `src/pages/fin/PayrollEmployeesPage.tsx` + `PayrollRunDetailPage.tsx` pentru sub-rute.

## In scope
- **`src/App.tsx`**: montează paginile FinDesk corecte sub `/business/fin/payroll*`:
  - import `PayrollFINPage` din `./pages/fin/PayrollPage` (și `PayrollEmployeesPage`, `PayrollRunDetailPage` din `./pages/fin/*`).
  - `/business/fin/payroll/employees` → `<PayrollEmployeesPage/>`
  - `/business/fin/payroll/runs/:id` → `<PayrollRunDetailPage/>` (dacă pagina folosește id din path)
  - `/business/fin/payroll` → `<PayrollFINPage/>`
  - toate în `<BusinessGuardPage>` (+ `Suspense` dacă sunt lazy, ca celelalte).
- Verifică în `src/pages/fin/PayrollPage.tsx` că link-urile interne (`#/app/fin/payroll/employees`,
  `#/app/fin/payroll/runs/:id`) sunt actualizate la `#/business/fin/payroll/...` (altfel re-introduc
  bug-ul FIX-501 — dead link → eject). Corectează-le.
- NU șterge `src/pages/app/PayrollPage.tsx` în acest item (poate fi folosit de o rută CRM `/app/hr/payroll`
  separată, dacă există). DOAR dacă grep confirmă că NU e referit de nicio rută → notează în „Backlog
  descoperit" propunerea de cleanup (sau, dacă e clar mort și nereferit, șterge-l + `src/lib/api/payroll.ts`
  + testele aferente, ca să nu rămână cod care cheamă un API inexistent).
- Confirmă `/api/fin/payroll/*` întoarce 200 la smoke (login → GET `/runs`).

## Acceptance criteria
- AC1: `/business/fin/payroll` randează pagina FinDesk (`PayrollFINPage`), NU varianta CRM.
- AC2: Pagina încarcă lista de runs fără „Nu pot încărca datele de salarizare".
- AC3: Calculul salarizării (POST `/runs/:id/calculate`) funcționează fără „Eroare la calculul salarizării".
- AC4: Sub-rutele `/business/fin/payroll/employees` și `/runs/:id` randează paginile corecte.
- AC5: Link-urile interne din paginile payroll sunt `/business/fin/...` (nu `/app/fin/...`).
- AC6: Live API smoke: login → `GET /api/fin/payroll/runs` 200; `POST .../calculate` 200.
- AC7: Build+typecheck+lint curate; zero `any`; route-mount + check-refs verzi.

## Tests (Given/When/Then)
- **T-FIX-502-1** [blocant] Given App.tsx, When grep import payroll, Then `/business/fin/payroll` mapat la `PayrollFINPage` din `pages/fin/`, nu `pages/app/`.
- **T-FIX-502-2** [blocant] Given server pornit + user autentificat, When `GET /api/fin/payroll/runs`, Then 200 + JSON (nu HTML).
- **T-FIX-502-3** [blocant] Given un run draft, When `POST /api/fin/payroll/runs/:id/calculate`, Then 200 (live API smoke).
- **T-FIX-502-4** [blocant] Given grep în paginile `src/pages/fin/Payroll*.tsx`, Then niciun link `#/app/fin/payroll` (toate `#/business/fin/payroll`).
- **T-FIX-502-5** [blocant] Given `npm run build`, Then zero erori TS + check-route-mounts verde.

## DoD
Build+typecheck+lint+test verzi, live API smoke verde, reviewer APPROVED, integration-architect CONNECTED,
persona reports salvate, commit pe `feat/AUDIT-FIX-faza-1-sidebar-payroll`.
