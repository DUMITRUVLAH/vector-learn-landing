# CRM-107 Code Review Report

**Date:** 2026-05-29
**Reviewer:** code-reviewer-vl (automated)
**Verdict:** APPROVED

## Summary

CRM-107 implements lead tasks (CRUD + complete + overdue) and file attachments per lead, with a task badge on kanban cards.

## Files changed

- `server/db/schema/tasks.ts` (new) — `lead_tasks` + `lead_attachments` tables
- `server/db/schema/index.ts` — exports tasks
- `server/routes/tasks.ts` (new) — full CRUD for tasks + attachments under `/api/leads/:leadId/tasks|attachments`
- `server/routes/leads.ts` — pipeline endpoint augmented with `nextTask` per lead; imports `leadTasks`
- `server/index.ts` — taskRoutes registered
- `src/lib/api/tasks.ts` (new) — typed API client for tasks + attachments
- `src/lib/api/leads.ts` — `nextTask` optional field on `Lead`
- `src/pages/app/LeadCardPage.tsx` — Tab Task-uri + Tab Fișiere implemented (was placeholder)
- `src/pages/app/LeadsPage.tsx` — task badge on kanban card
- `src/__tests__/crm/tasks-files.test.tsx` (new) — 12 tests CRM-107
- `src/__tests__/crm/lead-card.test.tsx` — updated to mock tasks API

## Acceptance criteria

- [x] Task cu scadență apare în tab + ca ⏰ pe card; întârziatul e roșu: YES
- [x] Bifare → done + completed_at + interaction system: YES (server writes system interaction)
- [x] Upload/download fișiere funcțional, tenant-scoped: YES (base64 data URL, download link)
- [x] 0 axe critical/serious; dark mode OK: YES

## Notes

- Attachments use base64 data URLs (no S3 integration yet — appropriate for Phase B; S3 integration in a future item)
- Pipeline endpoint makes one additional query for open tasks per load — acceptable O(n) for current scale
- `getNextTask` endpoint available for ad-hoc lookups

## Verdict

APPROVED — all CRM-107 acceptance criteria met, test gate passes.
