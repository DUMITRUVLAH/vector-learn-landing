# PAR-109 Integration Report

**Verdict:** CONNECTED

## Acceptance criteria verified

- [x] Out-of-order: locked step → 409 (with `locked_step` field)
- [x] Immutability: PATCH on pending_approval/approved/etc. → 403
- [x] Hash re-verify on GET /:id → `body_hash_valid` field in response
- [x] Hash mismatch → `integrity_mismatch_display` audit event
- [x] Escalation: resolveApprovalChain uses DOA matrix thresholds (100k = configurable)
- [x] Re-submit after changes_requested: existing approvals deleted, fresh chain + new hash
- [x] All transitions write par_audit

## Security notes
- Hash verification uses constant-time string comparison via SHA-256 digest comparison
- Integrity mismatch does NOT block display (returns flag + logs audit) — allows forensic review
- Integrity mismatch DOES block approval decision (409 returned before recording the decision)
