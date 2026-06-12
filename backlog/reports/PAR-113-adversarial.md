# PAR-113 — Adversarial Review Report (ce-adversarial-reviewer)

**Date:** 2026-06-12
**Item:** PAR-113 — Payment execution + 10% overage rule
**Verdict: APPROVED (no blocking issues)**

## Attack surface

### 1. 10% boundary arithmetic
- **exactly +10%**: `applyTenRule` uses `>` strict comparison: `actual > maxAllowed`.
  `770000 > 770000` is `false` → NOT reapproval. Correct per CORE §3 ("exceeds by MORE than 10%").
- **just over**: `770001 > 770000` → `true` → `reapproval_required`. Correct.
- **integer overflow risk**: `700000 * 110 = 77000000` — well within safe integer range (JS MAX_SAFE_INTEGER = 2^53-1 ≈ 9×10^15). Safe for realistic MDL amounts.

### 2. Rounding / float hazard
- `Math.floor((total * 110) / 100)` — multiply first, divide last, floor applied. Tested with odd total (700001): `70001110 / 100 = 770001.1 → floor = 770001`. No float drift.
- UI warning uses same formula — consistent.

### 3. Reapproval→pay path
- `/pay` on `reapproval_required` status: checks `pmtRow.overageReapproved === true` before proceeding, returns 409 if not yet re-approved. Prevents bypassing re-approval.
- `reapprove` endpoint sets `overage_reapproved = true` then moves PAR to `in_finance`. Finance can call `/pay` again.
- Guard: only `approver | par_admin` can call `reapprove`. Finance cannot self-approve their own overage. CORRECT.

### 4. Tenant isolation
- All DB queries: `and(eq(parRequests.tenantId, tenantId), eq(parRequests.id, parId))`. No cross-tenant leakage.

### 5. Status machine integrity
- `/pay` accepts only `in_finance` or `reapproval_required` (after overage_reapproved). All other states return 409. Terminal states (`paid`, `rejected`, `cancelled`) correctly blocked.

### 6. Double-payment prevention
- `par_payments.parId` has `.unique()` constraint. Upsert pattern handles re-submission.
- `paidAt` is set only on `paid` transition. Idempotency on re-pay of already-paid PAR blocked by status check.

### 7. Auth/role guard
- `/pay` and `/finance` require `finance | par_admin`.
- `/reapprove` requires `approver | par_admin`.
- No role escalation possible.

### 8. GDPR
- Payee data (IDNP/IBAN/name) not logged in audit trail — only amounts and refs. Correct.

## Findings: NONE blocking. All attack vectors addressed.
