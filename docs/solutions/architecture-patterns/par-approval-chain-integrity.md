---
title: "PAR approval chain: body-hash integrity + sequential step locking"
problem_type: architecture-pattern
module: PAR
tags: [par, approval, hash, integrity, immutability, sequential, locked]
symptoms: "Need to prove a submitted document wasn't tampered with after approval; need to block out-of-order approval"
severity: design
date: 2026-06-12
---

## Pattern

When building a multi-level approval workflow where:
1. The body (line items, payee, amounts) must be **immutable after submit**
2. Approval steps must happen **in order** (no skipping)
3. An audit can **prove integrity** cryptographically

Use this pattern from PAR Phase C:

## Implementation

### Body hash (immutability proof)

```ts
// integrity.ts — pure, no side effects
export function computeParBodyHash(body: ParBodyForHash): string {
  const canonical = canonicalize(body); // fixed-key-order JSON
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
```

- Hash all fields that "mean something" to approvers: header + line items + payee
- Exclude volatile fields: status, timestamps, attachments_present (those change legitimately)
- Use fixed key order in canonical JSON (deterministic across node versions)
- Store on the request row at submit: `par_requests.body_hash`
- Re-verify on every GET /:id and on every approve action → `body_hash_valid: boolean|null`

### Sequential locking

```sql
ALTER TABLE par_approvals ADD COLUMN locked boolean NOT NULL DEFAULT false;
```

- Step 1: `locked = false` (active)
- Steps 2+: `locked = true` (locked until prior step approved)
- When step N is approved → `UPDATE par_approvals SET locked=false WHERE id = nextStep.id`
- Approve attempt on locked step → 409 (not 403)

### Re-submit after changes_requested

```ts
// submitPAR() always:
await db.delete(parApprovals).where(and(eq(...parId), eq(...tenantId)));
// then re-creates step 0 + chain from resolveApprovalChain()
// new hash computed from the (potentially edited) body
```

## How to avoid pitfalls

- **Don't include status/timestamps in hash** — they change during the workflow
- **Sort line items by position in canonical JSON** — insertion order in DB may vary
- **Hash verification before approval, not after** — prevents approving a tampered body
- **Return `body_hash_valid: null`** for drafts (no hash yet) to distinguish from `false` (mismatch)
- **Integrity mismatch writes audit but doesn't hide the document** — forensic review requires visibility
