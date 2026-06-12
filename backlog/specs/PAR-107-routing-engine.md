---
id: PAR-107
title: "Motor de rutare DOA — pe submit, generează lanțul par_approvals din matrice"
milestone: PAR
phase: "C"
status: pending
attempts: 0
depends_on: [PAR-002, PAR-101]
spec: backlog/specs/PAR-107-routing-engine.md
core: backlog/par/PAR-CORE.md
---

## Goal

Inima fluxului: la submit, evaluează totalul (+ charge_to + department) împotriva matricei DOA și creează
lanțul ordonat de aprobări (`par_approvals`). Trece PAR-ul din `draft` în `pending_approval`, blochează
self-approval, „îngheață" corpul cererii (hash pentru integritate) și validează completitudinea.

## User stories

- **Ca** organizație, **vreau** ca cererile să meargă automat la aprobatorii corecți după sumă, **pentru că** nu vreau rutare manuală predispusă la erori.
- **Ca** approver, **vreau** ca cererile sub mine să apară doar când e rândul meu, **pentru că** aprobarea e secvențială.
- **Ca** auditor, **vreau** ca ce s-a aprobat să fie imutabil, **pentru că** trebuie să dovedesc integritatea.

## Acceptance criteria

- [ ] `POST /api/par/:id/submit` — doar autor, doar pe `draft`/`changes_requested`
- [ ] Validează completitudinea: ≥1 line item, total>0, end_use prezent dacă `execute_payment`, payee complet dacă `execute_payment` (400 cu listă de erori altfel)
- [ ] Apelează `resolveApprovalChain` (PAR-002) → creează rânduri `par_approvals` (step 1..N) cu `decision=pending`; doar step 1 e „activ", restul `locked`
- [ ] Self-approval blocat: dacă requestorul ar fi aprobatorul unui pas, se sare la următorul aprobator eligibil (sau, dacă nu există, pasul rămâne dar requestorul nu-l poate decide)
- [ ] PAR → `pending_approval`; `submitted_at` setat
- [ ] Body hash: calculează un hash determinist al (header + line items + payee) salvat pe PAR la submit (integritate, folosit la PAR-109 și pe PDF)
- [ ] Idempotent: re-submit pe un PAR deja `pending_approval` → 409
- [ ] Emite evenimentul de notificare „pending approval" către primul approver (consumat de PAR-111)

## Files

**New:**
- `server/lib/par/submit.ts` — logica de submit + hashing + chain creation (pură unde se poate)
- `server/lib/par/__tests__/submit.test.ts`

**Modified:**
- `server/routes/par.ts` — endpoint `/submit`

## Tests

- **T-PAR-107-1** [blocant] Given total 700000 > prag, When submit, Then 2 pași (DOA Holder → Executive Director), step1 pending, step2 locked
- **T-PAR-107-2** [blocant] Given total ≤ prag, Then 1 pas
- **T-PAR-107-3** [blocant] Given requestor=approver pasul 1, Then self-approval blocat
- **T-PAR-107-4** [blocant] Live API smoke: login + `POST /api/par/:id/submit` → 200 + lanț
- **T-PAR-107-5** [blocant] Given body la submit, Then hash calculat + salvat pe PAR
- **T-PAR-107-6** [normal] Given submit incomplet (fără linii), Then 400 cu erori

## DoD

- Migration/portability/live-smoke verzi · ce-adversarial-reviewer (mutație stare + bani) · reviewer APPROVED · personas salvate
