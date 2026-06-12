# PAR-107 Code Review

**Cycle:** 1
**Verdict:** APPROVED

## Summary

The routing engine correctly:
- Replaces the PAR-105 stub with a real DOA-driven `submitPAR()` function
- Calls `resolveApprovalChain` (PAR-002) and creates `par_approvals` rows with step locking
- Blocks self-approval by nulling out `approverUserId` when it matches the requestor
- Computes a SHA-256 body hash using the new `computeParBodyHash()` in `integrity.ts`
- Persists `body_hash` on `par_requests` (migration `0114_par_approval_engine.sql`)
- Cleans up old approval rows on re-submit (changes_requested → re-submit generates a fresh chain)
- Step 0 = requestor "signature"; steps 1+ from DOA matrix; step 1 unlocked, rest locked
- Idempotency: `pending_approval` → 409

## Design system compliance
- No hardcoded colors, no UI code in server logic
- ParInbox uses Vector 365 semantic tokens exclusively

## a11y
- All modals have role="dialog" + aria-modal + aria-labelledby
- All buttons have accessible names / aria-label
- Touch targets 44×44px via .touch-target

## No dead code, no console.log left behind

## Approval integrity
- EDITABLE_STATUSES guard in PATCH /:id still covers immutability (PAR-109 AC)
- Body hash verification happens before recording approval decision

**Integration:** CONNECTED — parApprovals route mounted in app.ts; `/app/par/inbox` route added to App.tsx; parApprovalsRoutes registered before generic /:id routes.
