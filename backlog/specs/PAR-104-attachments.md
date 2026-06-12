---
id: PAR-104
title: "Atașamente (secțiunea 13) — upload + kind + describe"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-101]
spec: backlog/specs/PAR-104-attachments.md
core: backlog/par/PAR-CORE.md
---

## Goal

Secțiunea 13 a formularului: atașamente la PAR (act de primire, contract, ofertă, factură) + un text
„describe" care apare pe PDF. Reutilizează exact pattern-ul de upload deja existent în repo (cel folosit
la lead/contract attachments) — fără mecanism nou de storage.

## User stories

- **Ca** requestor, **vreau** să atașez contractul și actul de primire, **pentru că** approverul are nevoie de dovezi.
- **Ca** approver, **vreau** să văd lista atașamentelor cu tipul lor, **pentru că** verific completitudinea dosarului.

## Acceptance criteria

- [ ] `POST /api/par/:id/attachments` — upload `{file, kind}` (kind ∈ enum `par_attachment_kind`); reutilizează helperul de upload existent
- [ ] `GET /api/par/:id/attachments` — listă cu `file_name`, `kind`, `uploaded_by`, `created_at`
- [ ] `DELETE /api/par/:id/attachments/:attId` — doar autor pe draft/changes_requested
- [ ] `attachments_present` (bool) + `attachments_note` (text) pe PAR (radio „Yes, describe" / „No")
- [ ] Limite de tip/size aliniate cu restul repo-ului; mesaj clar la respingere
- [ ] Tenant + PAR scope verificate

## Files

**New:**
- `server/routes/parAttachments.ts`
- teste `server/routes/__tests__/par-attachments.test.ts`

**Modified:**
- `server/app.ts` — mount

## Tests

- **T-PAR-104-1** [blocant] Given un PAR, When upload kind=contract, Then apare în GET cu file_name+kind
- **T-PAR-104-2** [blocant] Live API smoke: login + upload + GET → 200
- **T-PAR-104-3** [normal] Given attachments_present=true și 0 fișiere dar note completat, When submit, Then warning non-blocant

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
