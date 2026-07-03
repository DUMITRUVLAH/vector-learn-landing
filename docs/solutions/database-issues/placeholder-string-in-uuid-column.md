---
title: Placeholder string written to a uuid column → "invalid input syntax for type uuid"
problem_type: database_issue
module: par / ai-prefill
tags: [uuid, postgres, 22P02, invalid-input-syntax, placeholder-id, audit-log, captureExtractor, par-prefill, test-the-action]
symptoms: 'invalid input syntax for type uuid: "par-prefill-1782627099461"' shown in the UI when clicking "Completează automat din document"
severity: P1
date: 2026-06-28
---

## Symptom
The PAR "Completează automat din document" (AI prefill) action 500'd. The UI surfaced the raw
Postgres error `invalid input syntax for type uuid: "par-prefill-1782627099461"`.

## Root cause
`server/routes/parAiPrefill.ts` built a placeholder capture id as a string:
`const prefillId = \`par-prefill-${Date.now()}\`` and passed it to `extractCaptureFields(...)`, which
writes it as `entityId` into the AI-audit log — an `entity_id` **uuid** column (`server/db/schema/audit.ts`,
`aiAuditLog.ts`). Postgres rejects any non-uuid string for a uuid column (error 22P02). The prefill
isn't tied to a saved PAR yet, but the id still has to be a real uuid because of where it's stored.

## Fix
Use a real uuid: `import { randomUUID } from "node:crypto"; const prefillId = randomUUID();`
(commit fixing this: PR #218). Any synthetic id that lands in a uuid column must be `randomUUID()`,
never a templated string.

## How to avoid next time
- **Never put a non-uuid string into a uuid column.** If you need a throwaway id for a uuid column,
  it's `randomUUID()`. A `name-<timestamp>` string is a uuid bug waiting to 500.
- **Test the ACTION, not the affordance (CLAUDE.md §3.5.1quater).** This shipped because the e2e
  asserted the upload *button existed* but never *called* `POST /api/par/ai-prefill` — so the
  audit-log write (where it blew up) never ran. The regression guard is now a real upload scenario
  in `scripts/e2e-par-100.mjs` ("POST /api/par/ai-prefill (real doc upload) → 200"). Every new
  endpoint / AI-extract / upload / generate / pay / approve action needs one real invocation with a
  200 + shape assertion.
- Related class: [[migration-prefix-collision]] and the PAR UUID-guard work are the *inverse* —
  there, untrusted path input was a non-uuid; here, *our own code* generated the bad uuid.
