---
id: MASS-004
title: "Bulk retry manual + anulare job + notificare finalizare"
milestone: FIN
phase: "15"
status: pending
depends_on: [MASS-002, CORE-004]
spec: backlog/specs/MASS-004.md
branch: feat/FIN-mass
---

## Goal

Completează modulul bulk cu operații de management al job-urilor: retry manual al rândurilor
eșuate, anularea unui job în curs și notificarea (in-app) la finalizarea unui job.

---

## User stories

- Ca **contabil**, vreau să re-procesez manual rândurile eșuate dintr-un job, pentru că după
  ce corectez problema (ex: client inactiv reactivat) pot finaliza job-ul fără să-l re-creez.
- Ca **director financiar**, vreau să anulez un job în curs dacă am detectat o eroare în
  parametri, pentru că oprirea la timp previne date greșite în DB.
- Ca **utilizator**, vreau să primesc o notificare in-app când un job bulk finalizează (done/failed),
  pentru că nu vreau să monitorizez manual pagina.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/mass/jobs/:jobId/retry` — re-procesează toate rândurile cu `status='fail'`
  sau `retry_count < 3` (resetează `retry_count=0` pentru rândurile cu `status='fail'` din cauze
  DB, nu din cauze de validare — `error_message` care conțin 'validation' nu se re-încearcă).
  Returnează `{ retried: N }`.

- [ ] AC2: `POST /api/fin/mass/jobs/:jobId/cancel` — dacă job-ul e `pending` sau `running`,
  marchează `status='cancelled'`; toate rândurile `pending` devin `cancelled`. Nu poate anula
  un job `done` sau `failed`.

- [ ] AC3: Notificare in-app: la tranziția job-ului în `done` sau `failed`, inserează o înregistrare
  în `notifications` (sau `fin_bulk_jobs.finished_at` + polling pe FE) cu mesaj:
  "Job {type} finalizat: {success}/{total} rânduri cu succes."

- [ ] AC4: UI `/app/fin/mass`: butoane „Retry rânduri eșuate" și „Anulează" în detaliile job-ului
  (vizibile doar dacă job-ul e în starea potrivită). Confirmare dialog înainte de anulare.

- [ ] AC5: Tenant isolation. Zero `any`. Design system tokens.

---

## Files to create / modify

**Modify:**
- `server/routes/finMass.ts` — adaugă POST /jobs/:jobId/retry și /cancel
- `src/pages/fin/FinMassPage.tsx` — butoane retry + cancel în detalii job

**Create:**
- `src/__tests__/fin/fin-mass-retry.test.ts`

---

## Tests

- **T-MASS-004-1** `[blocant]` Given job cu 1 rând fail (non-validation), When POST /retry, Then rândul status='pending', retry_count=0.
- **T-MASS-004-2** `[blocant]` Given job running, When POST /cancel, Then job status='cancelled', rânduri pending→cancelled.
- **T-MASS-004-3** `[blocant]` Given job done, When POST /cancel, Then 400 (nu poate anula).
- **T-MASS-004-4** [normal] UI: butoanele retry/cancel sunt vizibile doar la stările corecte.

---

## Definition of Done

- [ ] AC1–AC5 implementate
- [ ] T-MASS-004-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
