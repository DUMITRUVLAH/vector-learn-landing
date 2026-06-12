---
id: PAR-112
title: "Coadă finanțe /app/par/finance + secțiunea 16 (PAR BL / Date Received / Received By / Assigned To)"
milestone: PAR
phase: "D"
status: pending
attempts: 0
depends_on: [PAR-109]
spec: backlog/specs/PAR-112-finance-queue.md
core: backlog/par/PAR-CORE.md
---

## Goal

Fluxul finanțelor (secțiunea 16 „Payment Internal Use Only"): o coadă cu PAR-urile aprobate de tip
`execute_payment`, unde finance înregistrează PAR BL (budget line), data primirii, cine a primit și cui e
asignat. Mută PAR-ul în `in_finance`.

## User stories

- **Ca** finance, **vreau** o coadă cu cererile aprobate de plătit, **pentru că** acolo e munca mea.
- **Ca** finance, **vreau** să marchez cine a primit și cui e asignată cererea, **pentru că** așa repartizăm munca.
- **Ca** organizație, **vreau** ca doar cererile `execute_payment` să ajungă la plată, **pentru că** estimările/ofertele nu se plătesc.

## Acceptance criteria

- [ ] `GET /api/par/finance` — PAR-uri `approved` + `purpose=execute_payment` (și `in_finance`/`reapproval_required`)
- [ ] `POST /api/par/:id/finance` `{par_bl, received_by_user_id?, assigned_to_user_id?}` — creează/actualizează `par_payments`; PAR → `in_finance`; doar rol finance
- [ ] `obtain_quotations`/`provide_estimate` NU apar în coadă (se închid la `approved`)
- [ ] UI `/app/par/finance`: tabel + formular secțiunea 16; role-aware (doar finance/admin)
- [ ] Tenant scope; Vector 365 light+dark; a11y
- [ ] Rute montate

## Files

**New:**
- `server/routes/parPayments.ts` — finance queue + section 16
- `src/pages/par/ParFinanceQueue.tsx`
- teste `server/routes/__tests__/par-finance.test.ts`, `src/pages/par/__tests__/ParFinanceQueue.test.tsx`

**Modified:**
- `server/app.ts`, `src/App.tsx` — `/app/par/finance`, `src/lib/api/par.ts`

## Tests

- **T-PAR-112-1** [blocant] Given PAR approved+execute_payment, When `/app/par/finance`, Then apare; fără crash
- **T-PAR-112-2** [blocant] Given finance completează secțiunea 16, Then `par_payments` creat; PAR → in_finance
- **T-PAR-112-3** [blocant] Live API smoke: login finance + `GET /api/par/finance` → 200
- **T-PAR-112-4** [normal] Given obtain_quotations PAR, Then NU apare în coadă

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
