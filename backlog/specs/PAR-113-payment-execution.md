---
id: PAR-113
title: "Execuție plată: actual amount + payment date/ref + proof + regula 10% → reapproval_required"
milestone: PAR
phase: "D"
status: pending
attempts: 0
depends_on: [PAR-112]
spec: backlog/specs/PAR-113-payment-execution.md
core: backlog/par/PAR-CORE.md
---

## Goal

Pasul final al banilor: finance înregistrează suma efectiv plătită, data, referința și dovada plății, apoi
marchează PAR-ul `paid`. Aplică regula tipărită pe formular: dacă suma reală depășește estimarea cu >10%
ȘI totalul e peste pragul micro-purchase, PAR-ul intră în `reapproval_required` și aprobatorul final
trebuie să re-aprobe înainte de `paid`.

## User stories

- **Ca** finance, **vreau** să înregistrez plata cu dovadă, **pentru că** trebuie să închid cererea cu audit.
- **Ca** organizație, **vreau** ca depășirile mari să fie re-aprobate, **pentru că** așa scrie regula formularului.
- **Ca** auditor, **vreau** suma estimată vs. plătită, **pentru că** urmăresc abaterile de buget.

## Acceptance criteria

- [ ] `POST /api/par/:id/pay` `{actual_amount_cents, payment_date, payment_ref, proof_url?}` — doar finance, doar pe `in_finance`/`reapproval_required` (după re-aprobare)
- [ ] Regula 10%: dacă `actual_amount_cents > total_estimated_cents * 1.10` ȘI `total_estimated_cents > micro_purchase_threshold_cents` → PAR → `reapproval_required` (NU `paid`); notifică aprobatorul final
- [ ] Sub prag SAU în limita +10% → PAR → `paid`, `paid_at`, `par_payments.actual_amount_cents`/date/ref/proof setate
- [ ] Re-aprobare: `POST /api/par/:id/reapprove` (aprobatorul final) → revine la `in_finance` cu `overage_reapproved=true`; endpoint plasat în `server/routes/parApprovals.ts` (nu `parPayments.ts`) — e o acțiune de aprobare cu același guard + audit trail (CORE §4)
- [ ] Toate sumele în minor units; calculul pragului fără floating point hazards (folosește integer math)
- [ ] Scrie `par_audit` + notificare la `paid`

## Files

**New:**
- `server/lib/par/payment.ts` — regula 10% + tranziții (pură, testabilă)
- `server/lib/par/__tests__/payment.test.ts`

**Modified:**
- `server/routes/parPayments.ts` — `/pay`, `/reapprove`

## Tests

- **T-PAR-113-1** [blocant] Given total 700000 (>prag), actual 800000 (>10%), Then PAR → reapproval_required
- **T-PAR-113-2** [blocant] Given actual ≤ +10%, Then PAR → paid + paid_at
- **T-PAR-113-3** [blocant] Given total ≤ prag, actual >10% peste, Then se poate plăti fără reaprobare
- **T-PAR-113-4** [blocant] Live API smoke: login + `POST /api/par/:id/pay` → stare corectă
- **T-PAR-113-5** [normal] Given reapproval_required, When reapprove + pay, Then paid cu overage_reapproved=true

## DoD

- Live-smoke + portability verzi · ce-adversarial-reviewer (bani + tranziții) · reviewer APPROVED · personas salvate
