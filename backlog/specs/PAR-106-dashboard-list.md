---
id: PAR-106
title: "Dashboard + listă /app/par (cererile mele, status chips, filtre, totaluri)"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-101, PAR-105]
spec: backlog/specs/PAR-106-dashboard-list.md
core: backlog/par/PAR-CORE.md
---

## Goal

Pagina de start a modulului: o vedere role-aware care arată cererile relevante pentru userul curent —
requestorul își vede cererile proprii + draft-urile; approverul vede „pending my approval"; finance vede
„awaiting payment". Status chips, filtre, totaluri și acces rapid la creare/detaliu.

## User stories

- **Ca** requestor, **vreau** să-mi văd toate cererile cu starea lor, **pentru că** vreau să știu ce e aprobat și ce e blocat.
- **Ca** approver, **vreau** să văd direct ce așteaptă aprobarea mea, **pentru că** nu vreau să caut.
- **Ca** manager, **vreau** totaluri (sumă pe stări), **pentru că** vreau o privire de ansamblu rapidă.

## Acceptance criteria

- [ ] Ruta `/app/par` în `src/App.tsx`
- [ ] Secțiuni vizibile după rolurile din `GET /api/par/me`: „My requests" (toți), „Pending my approval" (approver), „Awaiting payment" (finance)
- [ ] Tabel/listă cu: request_no, project, total (MDL formatat), status chip colorat, data, requestor
- [ ] Filtre: status, purpose, project, search (`q`); paginare
- [ ] Buton „New request" → `/app/par/new`; rând click → `/app/par/:id`
- [ ] Status chips cu culori din tokens semantici (draft/pending/approved/in_finance/paid/rejected/cancelled), light + dark
- [ ] a11y + fără hex hardcodat; smoke test de randare

## Files

**New:**
- `src/pages/par/ParDashboard.tsx`
- `src/components/par/ParStatusChip.tsx`
- `src/pages/par/__tests__/ParDashboard.test.tsx`

**Modified:**
- `src/App.tsx` — rută `/app/par`
- `src/lib/api/par.ts` — `listPar(filters)`

## Tests

- **T-PAR-106-1** [blocant] Given requestor cu 3 PAR-uri, When `/app/par`, Then listă cu chips, fără crash
- **T-PAR-106-2** [normal] Given filtru status=draft, Then doar draft-urile
- **T-PAR-106-3** [normal] Given approver/finance, Then văd secțiunile lor dedicate

## DoD

- Build verde · reviewer APPROVED · personas salvate
