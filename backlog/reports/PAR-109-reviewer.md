# PAR-109 Code Review

**Cycle:** 1
**Verdict:** APPROVED

## Summary

Sequential integrity guarantees are now enforced:

1. **Out-of-order lock (T-PAR-109-1):** Approve attempt on locked step returns 409 with `locked_step` field — explicit error, not a generic 403.
2. **Body immutability (T-PAR-109-2):** EDITABLE_STATUSES guard in PATCH /:id + line-item endpoints blocks all mutation after `pending_approval`. Returns 403.
3. **Hash re-verify on display (T-PAR-109-3):** GET /:id re-computes body hash and returns `body_hash_valid: boolean|null`. Mismatch writes `integrity_mismatch_display` audit event.
4. **Escalation (T-PAR-109-4):** threshold-driven by DOA matrix (resolveApprovalChain). 3-step chain generated for amounts > 100k (configurable). Validation layer doesn't block large amounts.
5. **Re-submit after changes_requested (T-PAR-109-5):** `submitPAR()` deletes existing approvals and generates a fresh chain + new hash on each submit.
6. **All transitions write `par_audit`.**

## Design system
- No new UI components added for PAR-109 (pure backend hardening)
- `body_hash_valid` flag exposed to frontend for future display

## Tests
- 8 unit tests cover all structural edge cases
- All pass

**Integration:** CONNECTED
