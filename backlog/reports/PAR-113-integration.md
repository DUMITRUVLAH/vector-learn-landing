# PAR-113 — Integration Architecture Report

**Date:** 2026-06-12
**Item:** PAR-113 — Payment execution + 10% rule
**Verdict: CONNECTED**

## Integration points verified

### Backend
- `POST /api/par/:id/pay` → updates `par_payments` + `par_requests.status` + writes `par_audit` + notifies requestor via `notifyPaid`
- `POST /api/par/:id/reapprove` → in `parApprovals.ts` (correct per spec) → sets `par_payments.overage_reapproved=true` → PAR back to `in_finance`
- State machine: `in_finance → paid` OR `in_finance → reapproval_required → (reapprove) → in_finance → paid`
- `par_audit` written on both `paid` and `reapproval_required` events
- Notification: `notifyPaid` calls existing `server/services/par/notify.ts` — no new notification system

### Frontend
- `ParFinanceQueue.tsx` has pay modal with actual_amount_cents, payment_date, payment_ref, proof_url
- UI warning at +10% boundary computed with same integer math as server
- Pay button enabled on `in_finance`; after reapproval (`overage_reapproved=true`) also shown on `reapproval_required`
- `formatMDL` used throughout for money display

### DB
- `par_payments.parId` unique — one payment record per PAR
- `par_requests.paidAt` set on `paid` transition
- All queries use Drizzle query builder (no raw `.execute().rows`)

### Route ordering
- `parPaymentsRoutes` mounted BEFORE `parRoutes` in app.ts — `/api/par/finance` not captured by `/:id` param

## No gaps found.
