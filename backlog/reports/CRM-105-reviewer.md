# CRM-105 Code Review Report

**Date:** 2026-05-29
**Reviewer:** code-reviewer-vl (automated)
**Verdict:** APPROVED

## Summary

CRM-105 implements pipeline customization (custom stages), mandatory lost reason modal, and client-side filters on the leads kanban. The implementation is solid and complete.

## Files changed

- `server/db/schema/pipeline.ts` (new) — `pipeline_stages` table with correct columns, default seed data
- `server/routes/pipeline.ts` (new) — CRUD routes for stages (list/create/patch/reorder/delete), auth-gated
- `server/db/schema/leads.ts` (modified) — added `assignedTo` column
- `server/routes/leads.ts` (modified) — added `dedup-check` endpoint, dynamic stage validation via `pipeline_stages`, `lost_reason_required` guard
- `src/lib/api/pipeline.ts` (new) — typed API client for pipeline stages
- `src/lib/api/leads.ts` (modified) — added `assignedTo` to Lead interface, `checkDuplicate`, `DedupResult`; stage changed from `LeadStage` to `string` (supports custom keys)
- `src/pages/app/LeadsPage.tsx` (modified) — integrated `fetchPipelineStages`, `StagesEditorModal`, `LostReasonModal`, filter bar, dynamic kanban columns
- `src/__tests__/crm/pipeline.test.tsx` (new) — 13 tests covering T-CRM-105-1..5

## Acceptance criteria

- [x] New stage appears as column with order/color: YES (kanban iterates `stages` state, auto-seeded)
- [x] Lost without reason cancels move; with reason saves `lost_reason`: YES (server returns 400 `lost_reason_required`, client shows modal)
- [x] Filters client-side without refetch: YES (filter functions on local state)
- [x] Live search on name+phone normalized: YES (normalized phone digits + lowercase name)
- [x] `stage_change` interaction written on every move: YES (server inserts `leadInteractions` on every stage patch)

## Positives

- Dynamic stage system future-proofs the pipeline for CRM-106+
- Server validates stage key against `pipeline_stages` table (prevents invalid keys)
- `isLost` flag correctly propagated both from DB and default fallback
- All accessibility attributes present (aria-label on icon buttons, role="radiogroup", sr-only labels)
- No hardcoded hex values — all `pastel-*` tokens

## Minor issues (no block)

- `LeadStage` enum type is still exported from `leads.ts` but not used for the `stage` field; it's kept as a reference type — acceptable for backward compat
- `StagesEditorModal` shows GripVertical but drag-reorder is not wired (visual only) — reorder API exists on backend; the UI drag-reorder is a CRM-105 enhancement to backlog
- Bundle size warning (>500KB) — pre-existing, not introduced by this item

## Verdict

APPROVED — all CRM-105 acceptance criteria met, test gate passes, no critical or serious issues.
