---
id: PAR-116
title: "Admin DOA matrix UI /app/par/admin (praguri per rol/department/charge_to) + members/roles"
milestone: PAR
phase: "F"
status: pending
attempts: 0
depends_on: [PAR-107, PAR-003]
spec: backlog/specs/PAR-116-admin-doa.md
core: backlog/par/PAR-CORE.md
---

## Goal

Panoul de administrare al modulului: par_admin configurează matricea DOA (benzi de sumă → pași de
aprobare per rol/department/charge_to), pragul micro-purchase, și gestionează membrii + rolurile PAR.
Front-end peste API-urile din PAR-002/PAR-003.

## User stories

- **Ca** admin, **vreau** să definesc cine aprobă la ce sumă, **pentru că** politica organizației se schimbă.
- **Ca** admin, **vreau** să atribui roluri oamenilor, **pentru că** echipa se schimbă.
- **Ca** organizație, **vreau** ca doar adminii să atingă aceste setări, **pentru că** sunt sensibile.

## Acceptance criteria

- [ ] Ruta `/app/par/admin` — doar `par_admin` (non-admin → 403/redirect)
- [ ] Tab DOA: tabel editabil cu rânduri (charge_to?, department?, min/max amount, step, approver role/label, approver user?) — add/edit/delete prin `/api/par/doa`
- [ ] Tab Settings: prag micro-purchase, monedă implicită, denumire legală, logo, help URL, prefix (PAR-003 `/api/par/settings`)
- [ ] Tab Members: listă useri + rolurile PAR + approval limit; add/revoke prin `/api/par/members`
- [ ] Tab Reference data: budget codes / departments / projects / vendors (CRUD din PAR-003)
- [ ] Modificarea pragului afectează rutarea cererilor noi (validat prin test)
- [ ] Vector 365, light+dark, a11y; smoke test de randare + un test de editare

## Files

**New:**
- `src/pages/par/ParAdmin.tsx` (+ subtaburi: `DoaMatrixEditor`, `ParSettingsForm`, `ParMembersTab`, `ParReferenceData`)
- teste `src/pages/par/__tests__/ParAdmin.test.tsx`

**Modified:**
- `src/App.tsx` — `/app/par/admin`; `src/lib/api/par.ts` — clienți admin

## Tests

- **T-PAR-116-1** [blocant] Given par_admin, When `/app/par/admin`, Then randare fără crash; poate adăuga/edita un rând DOA
- **T-PAR-116-2** [blocant] Given non-admin, Then `/app/par/admin` blocat
- **T-PAR-116-3** [normal] Given modific pragul, Then cererile noi rutează după noua valoare

## DoD

- Build verde · reviewer APPROVED (a11y, dark) · personas salvate
