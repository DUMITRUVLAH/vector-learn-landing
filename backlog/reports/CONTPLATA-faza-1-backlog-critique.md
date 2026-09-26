# Backlog critique — CONTPLATA-faza-1

Spec: `backlog/specs/CONTPLATA-faza-1.md` · worktree `vl-cont-plata` ·
branch `feat/CONTPLATA-faza-1-crm-personalizabil`

Note on process: this spec is a single owner-request doc (frontmatter `id/status/branch`), not
six separate `STATE.json` entries with `depends_on`. Per instructions I did not touch
`STATE.json`/`BACKLOG.md`. If this phase is meant to run through the normal orchestrator loop,
it should get real `CP-01..CP-06` entries with `depends_on` (CP-02..CP-06 all depend on CP-01;
CP-06 depends on CP-02/03/04/05) before build — recommend, don't block on it.

## Per item

### CP-01 — Model — **KEEP**
Correct foundation, correct call to build ON the existing `payment_accounts`/`seller_profiles`
tables (confirmed live: `git diff origin/main --stat` shows only `_journal.json` touched so far —
these tables are the pre-existing "second module" the spec describes, not new). Migration +
schema-drift + bidirectional-match acceptance criteria already present and correctly `[blocant]`.
No change needed beyond the repo-wide gate reminder added below.

### CP-02 — Numbering — **IMPROVE (applied)**
Real correctness gap, not just a nit: the *current* `/issue` handler
(`server/routes/paymentAccounts.ts`) assigns the next number with a plain
`SELECT max(number)... ` followed by a separate `UPDATE` — not atomic, so two concurrent
`issue` calls on the same tenant+series can mint the same `documentNumber` (a real invoice-number
collision, not hypothetical). The repo already has the fix pattern one file over:
`server/routes/docs.ts` finalize path uses an atomic
`INSERT … ON CONFLICT (tenantId, kind, year) DO UPDATE SET lastNumber = lastNumber + 1 RETURNING`
against `docNumberSequences`. CP-02's spec didn't mention concurrency at all and would have
shipped the same race under a new name. **Applied fix:** added an explicit note in the spec to
require the atomic-upsert pattern (reuse or replicate `docNumberSequences`'s approach) instead of
select-then-update, plus a new `[blocant]` acceptance criterion: 10 simultaneous `issue` calls on
one tenant+series must produce 10 distinct, gap-free numbers.

### CP-03 — PDF — **KEEP**
Correctly reuses `pdfDocument.ts`/`pdfmake` (already proven in `docs.ts`/`documentPdf.ts` and PAR)
instead of resurrecting Playwright/Chromium, which is exactly the root cause identified. Defensive
acceptance criteria (bad accent color falls back, missing logo doesn't error) are the right kind
of test — keep as-is.

### CP-04 — Catalog — **KEEP, minor ambiguity flagged (not fixed)**
Correctly reuses `crm_products` + `fin_inventory_items` (same LEFT JOIN pattern as
`/api/crm/products`) instead of a parallel catalog, and correctly keeps stock decrement out of
scope (owned by opportunity-won, not payment-account issue) — good scope discipline, resist the
temptation to "also decrement stock here." One ambiguity left for the builder to resolve, not
blocking: "un serviciu folosit de 3 ori apare o singură dată" doesn't say what "same" means
(distinct by `product_id`, or by normalized free-text `description` for lines with no
`product_id`?) — two builders could diverge on the free-text case. Low stakes, `[normal]` not
`[blocant]`, left for the builder.

### CP-05 — Templates — **KEEP**
Checked for the obvious duplicate: the docs engine (`docmergeTemplates`) explicitly says in its
own schema comment "a second templates table would diverge — COMPETING_SYSTEM," which made this
worth checking carefully. It does NOT apply here: `docmergeTemplates` stores HTML bodies with
`{{placeholder}}` tags for the acte/contracte engine — a different shape from what CP-05 needs
(a structured snapshot of client + line items + notes to prefill a new draft). The spec's own
framing, "șabloane ca la PAR," is the right call — `parTemplates` (checked:
`server/db/schema/par.ts` + `server/routes/parTemplates.ts`) is exactly this JSON-snapshot +
`instantiate` pattern, per-tenant-isolated. A new `payment_account_templates` table mirroring
that pattern is legitimate reuse-of-pattern, not a competing system. No change.

### CP-06 — CRM UI — **KEEP**
Correctly folds the module into CRM nav instead of a standalone shell, and correctly redirects
both legacy entry points (`/business/fin/invoices/document` generator AND `/business/conturi-plata/*`
old module) instead of leaving either as a second live surface. `FRAMEABLE_BY_US` reuse is
already scoped correctly in `securityHeaders.ts` for PAR/CRM/docs — CP-03/CP-06 need to add the
new `/api/payment-accounts/:id/pdf` route to that same regex (spec's CP-03 acceptance criterion
already calls this out as `[blocant]` — verified: the regex file doesn't have a payment-accounts
line yet, so this is real, not already-done).

## COMPETING_SYSTEM check — the one I looked hardest for

Three prior systems could plausibly collide with this phase: the OLD `/business/conturi-plata`
module (confirmed dead-but-live, correctly being merged in, not duplicated — this is the fix, not
a new risk), the generic acte/contracte engine `docs.ts`+`doc_documents`+`docNumberSequences`+
`docmergeTemplates` (checked numbering — real gap, fixed above; checked templates — different
shape, not a collision), and PAR's `parTemplates` (correctly the pattern CP-05 should mirror, and
does). No new COMPETING_SYSTEM found beyond the numbering gap.

## Fixes applied directly to the spec (2)
1. CP-02: added the atomic-numbering requirement + a `[blocant]` concurrency acceptance
   criterion (race condition would have shipped otherwise — this is a money-adjacent document
   number, a duplicate is a real support ticket).
2. Added a short "Gate-uri obligatorii" section before the item list, pointing at the repo-wide
   live-API-smoke requirement (CLAUDE.md §3.5.1) for every new route CP-02..CP-06 add — the spec's
   own acceptance criteria are otherwise silent on this per-item, relying on the test-runner catching
   it late instead of the builder building it in from the start.

## Product-level

This batch does the hard thing well: instead of patching the broken generator in place, it found
and killed the actual duplicate module (`conturi-plata`) and consolidated onto the one persistent,
correct data model, while deliberately reusing `fin_org_profile`, `crm_products`, `pdfDocument.ts`,
and the PAR-template pattern rather than rebuilding any of them — this is exactly the reuse
discipline CLAUDE.md asks for, and it clearly came from actually reading the code, not guessing.

**Biggest risk:** the numbering race (fixed above) — an invoice-numbering collision under
concurrent issue is the one bug class in this phase that reaches a real client relationship
(duplicate document numbers on money documents look bad and are hard to explain after the fact).

**Highest-value addition beyond scope-as-written:** none needed for this phase — CP-06 already
correctly excludes email-send, payment-matching, and e-Factura conversion into "Ce NU intră," which
is the right amount of restraint (each of those is a real feature but belongs to a later phase once
this one is stable and reused end-to-end).
