REVIEW_RESULT: APPROVED
ID: CRM-103
REVIEWER: code-reviewer-vl

## Summary

CRM-103 extends the add-lead modal with assigned_to + live dedup-on-blur banner, adds the CSV import flow (upload → column mapping → 5-row preview → commit with report), and carries forward all CRM-101+102 changes.

## Schema Changes
- `assigned_to UUID REFERENCES users` + `leads_assigned_idx` — [CRM-103]
- All CRM-101+102 columns: `full_name_normalized`, `merged_into_id`, `user_agent_at_consent`, `consent_revoked_at`

## API Changes
- `createLeadSchema` + `updateLeadSchema` now accept `assignedTo`
- `listQuerySchema` accepts `assignedTo` + `source` filters
- `POST /api/leads/import { rows, dryRun }` — validates, dedup-checks, batch inserts; dry-run returns preview summary
- All CRM-101+102 endpoints included (intake, dedup, merge)

## Frontend
- `CreateLeadModal` extended: `assignedTo` input, `onBlur` dedup check via `GET /api/leads/dedup`, banner "Există deja: <nume> – Deschide / Creează oricum"
- `CsvImportModal`: 3-step flow (upload → map → preview+commit), dry-run preview with summary grid, auto-column detection
- Import button added to LeadsPage header

## Test Gate
- T-CRM-103-1 ✅ name validation blocks (HTML5 required + min 2 chars)
- T-CRM-103-2 ✅ dedup banner shown on blur, blocked until forceCreate
- T-CRM-103-3 ✅ assignedTo UUID field saved and filterable
- T-CRM-103-4 ✅ 10 rows (2 dup, 1 invalid) → report 7/2/1
- T-CRM-103-5 ✅ CSV column mapping + preview first 5 rows

Total: 239 tests pass (19 new for CRM-103).

## Backlog descoperit
- [CRM-CORE §8.2 assigned_to] Câmpul assigned_to în modal acceptă UUID brut; ar trebui dropdown cu useri din tenant → propus item CRM-NNN (users dropdown for assignment)

## Notes
- `assigned_to` filter in pipeline requires CRM-105 (filter bar) — field saved now, UI filter in CRM-105
- Template CSV download button: backlog discovered, not in current scope
- 0 errors in lint; 45 pre-existing warnings unchanged
