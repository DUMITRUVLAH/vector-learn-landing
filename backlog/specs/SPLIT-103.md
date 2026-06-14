---
id: SPLIT-103
title: Rute /business/* — refolosesc paginile FinDesk/PAR/ITPark existente (mapare, fără rescriere)
milestone: SPLIT
phase: "2"
branch: feat/SPLIT-business-shell
status: pending
depends_on: ["SPLIT-101"]
---

## Goal
Mapează rutele `/business/fin/*` → paginile FinDesk existente, `/business/par/*` → paginile PAR existente, `/business/itpark/*` → paginile ITPark existente — toate învelite în `BusinessShell`. NU rescrie paginile. Guard `requireApp('business')` pe orice `/business/*` (via `useBusinessSession`). Acesta e wire-up-ul: paginile există deja, acum au un container nou cu sidebar Business Suite.

## User stories
- Ca CFO autentificat în Business Suite, vreau să accesez `/business/fin/expenses` și să văd cheltuielile FinDesk învelite în sidebar Business Suite (nu AppShell-ul educațional), pentru că cele două aplicații trebuie să arate distinct.
- Ca admin PAR, vreau `/business/par` să arate dashboard-ul PAR în shell-ul Business Suite, pentru că `/app/par` e în contextul CRM educațional și am nevoie de separare vizuală.
- Ca manager ITPark, vreau `/business/itpark` să listeze rezidenții în shell-ul Business Suite, pentru că ITPark nu are treabă cu elevii/profesorii.
- Ca developer, vreau că maparea rutelor se face în `App.tsx` prin delegare simplă (fără duplicate de componente), pentru că principiul e „reuse, don't rebuild".

## Acceptance criteria
- [ ] Rute mapate în `App.tsx` (toate wrapped în `BusinessShell` sau delegare cu guard):
  - `/business/fin/*` → aceleași componente ca `/app/fin/*` (FinDesk pages) — wrapped în `BusinessShell`
  - `/business/par/*` → aceleași componente ca `/app/par/*` (PAR pages) — wrapped în `BusinessShell`
  - `/business/itpark/*` → aceleași componente ca `/app/fin/itpark/*` — wrapped în `BusinessShell`
  - `/business/dashboard` → `BusinessDashboardPage` (din SPLIT-101, deja wrapped)
- [ ] Nicio pagină FinDesk/PAR/ITPark nu e copiată/duplicată. Componentele refolosite sunt exact cele existente.
- [ ] `useBusinessSession` guard activ pe toate rutele `/business/*` (excepție: `/business/login` și `/business` landing care sunt publice). Un user fără sesiune business → redirect `/business/login`.
- [ ] Un user CRM (sesiune `app_kind='learn'`) care accesează `/business/fin/expenses` → redirect `/business/login` (acces încrucișat respins).
- [ ] `/app/fin/*` rămâne neatins (paginile FinDesk continuă să funcționeze în AppShell pentru userii learn).
- [ ] Build + typecheck verde. 0 `any`, fără importuri circulare.
- [ ] Cel puțin rutele cheie mapeate: `/business/fin/` (FinHome), `/business/fin/expenses`, `/business/fin/invoices`, `/business/par` (ParDashboard), `/business/par/inbox`, `/business/par/new`, `/business/par/reports`, `/business/itpark` (ItparkList), `/business/itpark/dashboard`.

## Files
- `src/App.tsx` — adaugă blocul de rute `/business/*` (mapare delegată, toate wrapped în BusinessShell + guard)
- `src/components/business/BusinessShell.tsx` — poate necesita `wrapPage` helper (opțional)

## Tests
- **T-SPLIT-103-1** [blocant] Given sesiune business validă (mock /api/business/auth/me → 200), When render la path='/business/fin/', Then FinHome e montat (nu crash, nu redirect).
- **T-SPLIT-103-2** [blocant] Given nicio sesiune business (mock /api/business/auth/me → 401), When render la path='/business/fin/expenses', Then navigate('/business/login') e apelat.
- **T-SPLIT-103-3** [blocant] Given path='/app/fin/expenses' (rută learn), When render, Then FinExpensesPage e montat (paginile existente rămân neatinse).
- **T-SPLIT-103-4** [normal] Given sesiune business validă, When render la path='/business/par', Then ParDashboard e montat în BusinessShell (sidebar-ul Business Suite e vizibil).
- **T-SPLIT-103-5** [normal] Given sesiune business validă, When render la path='/business/itpark', Then ItparkList e montat fără crash.
- **T-SPLIT-103-6** [normal] Given sesiune learn (app_kind='learn') care accesează /business/fin/, When useBusinessSession verifică sesiunea, Then redirect la /business/login (acces încrucișat respins).

## DoD
- Toate rutele `/business/fin/*`, `/business/par/*`, `/business/itpark/*` mapeate fără copiere de componente
- Guard `useBusinessSession` activ pe toate `/business/*` protejate
- `/app/fin/*` rămâne neatins
- Acces încrucișat (learn → business routes) respins
- Build + typecheck verde
