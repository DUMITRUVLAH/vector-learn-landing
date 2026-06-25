---
id: VM1-01
title: "Access-control PAR — modulul e complet ascuns fără rol PAR"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/VM1-01-access-control.md
core: backlog/par/PAR-CORE.md
---

## Goal

Un utilizator care NU are niciun rol PAR nu trebuie să vadă deloc modulul PAR — secțiunea „PAR — Cereri
de plată" din sidebar dispare integral pentru el. Server-ul deja întoarce 403 per-rol pe fiecare endpoint;
acesta este stratul de vizibilitate din UI, ca să nu existe meniuri moarte. Decizia owner-ului: ascundere
totală (nu „grayed out"), iar restul modulelor (FinDesk, ITPark) rămân neatinse.

## User stories

- **Ca** utilizator fără rol PAR, **vreau** să nu văd deloc meniul PAR, **pentru că** nu mă privește și
  doar mă încurcă.
- **Ca** approver/requestor/finance/par_admin, **vreau** să văd meniul PAR imediat după login, **pentru
  că** am cel puțin un rol activ.
- **Ca** owner, **vreau** ca FinDesk și ITPark să rămână vizibile, **pentru că** access-control-ul vizual
  e doar pentru PAR.

## Acceptance criteria

- [ ] Un mic hook/util (ex. `useParRoles`) cheamă `getParMe()` (GET `/api/par/me`) și expune `roles: string[]`
- [ ] Secțiunea PAR din `BusinessShell.tsx` (`NAV_GROUPS` „PAR — Cereri de plată" + `PAR_NAV_GROUPS` pentru `/business/par/*`) se randează DOAR dacă `roles.length >= 1`
- [ ] Orice intrare PAR din `AppShell.tsx` se ascunde după aceeași regulă (`roles.length >= 1`)
- [ ] Când `roles=[]`, întreaga secțiune PAR lipsește din DOM (nu doar `disabled`/`hidden` vizual)
- [ ] Stare de loading tratată: cât timp rolurile se încarcă, secțiunea NU pâlpâie (nu apare-apoi-dispare); se randează doar după ce răspunsul a venit
- [ ] FinDesk, ITPark și restul `NAV_GROUPS` rămân vizibile indiferent de rolurile PAR (blast-radius controlat — shell-ul e partajat)
- [ ] Eroare/`401` pe `/api/par/me` => tratat ca `roles=[]` (fail-closed pe vizibilitate), fără crash de shell
- [ ] Tenant-scoped: rolurile reflectă tenant-ul curent (vin din `getParMe`, nu cache stale între tenanți)
- [ ] Fără hex hardcodat, dark-mode ok, fără linkuri moarte rămase

## Files

**New:**
- `src/lib/hooks/useParRoles.ts` (sau util echivalent care wrappează `getParMe`)
- teste `src/components/business/__tests__/business-shell-par-visibility.test.tsx`

**Modified:**
- `src/components/business/BusinessShell.tsx` — gate pe secțiunea PAR (`NAV_GROUPS` + `PAR_NAV_GROUPS`)
- `src/components/app/AppShell.tsx` — gate pe orice entry PAR

## Tests

- **T-VM1-01-1** [blocant] Given `getParMe` întoarce `roles=[]`, When se randează BusinessShell, Then secțiunea „PAR — Cereri de plată" NU e în DOM
- **T-VM1-01-2** [blocant] Given `roles=["approver"]`, When se randează BusinessShell, Then secțiunea PAR e vizibilă, iar FinDesk/ITPark rămân vizibile
- **T-VM1-01-3** [normal] Given răspunsul `/api/par/me` e în loading, When se randează shell-ul, Then secțiunea PAR nu pâlpâie (apare doar după rezolvare)
- **T-VM1-01-4** [normal] Given `/api/par/me` întoarce 401, When se randează shell-ul, Then se comportă ca `roles=[]` fără crash

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
