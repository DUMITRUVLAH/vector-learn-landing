---
id: CRM-127
slug: undo-audit
phase: H
depends_on: [CRM-106]
milestone: CRM
---

# CRM-127 — Undo + audit log acțiuni CRM

## Goal

Give academy managers full visibility into every destructive CRM action (delete, stage change,
bulk operations, field edits) and provide a 30-second undo window for the most common mistakes.
This builds trust in the system ("nothing is lost") and supports GDPR accountability.

## User stories

- **US-CRM-127-1**: As a manager I want an audit log showing who changed what and when on any lead,
  so I can trace mistakes and hold staff accountable.
- **US-CRM-127-2**: As a user I want an undo toast that appears for 30 seconds after I delete a lead
  or bulk-delete, so I can recover an accidental deletion.
- **US-CRM-127-3**: As an admin I want to see a tenant-wide audit feed (`/app/audit-log`) showing
  the last 200 actions across all leads, filterable by user and action type.

## Acceptance criteria

1. **DB**: new table `crm_audit_log` (id uuid PK, tenant_id FK, actor_id FK users, entity_type varchar(64) default 'lead', entity_id uuid, action varchar(64), before_snapshot jsonb nullable, after_snapshot jsonb nullable, created_at timestamptz default now()).
   Index on (tenant_id, created_at DESC), (entity_id, created_at DESC).
2. **Audit writes**: insert a `crm_audit_log` row on every:
   - Lead created (action='lead.created', after_snapshot = lead JSON)
   - Lead stage changed (action='lead.stage_changed', before/after snapshot)
   - Lead deleted (action='lead.deleted', before_snapshot = lead JSON)
   - Lead field updated via PATCH (action='lead.updated', before/after snapshot — only changed fields)
   - Bulk stage change (action='bulk.stage_changed', after_snapshot = {lead_ids[], to_stage})
   - Bulk delete (action='bulk.deleted', before_snapshot = {lead_ids[]})
3. **API `GET /api/audit-log`**: paginated (default limit 50, max 200), filters: `entity_id`, `actor_id`, `action`. Returns rows newest-first. Auth required, tenant-scoped.
4. **Undo token API**:
   - `POST /api/leads/:id/delete` (replaces direct DELETE — keeps the DELETE endpoint as alias): stores a `deleted_leads` entry in memory (Map, keyed by undo token) for 35 seconds, returns `{undoToken: string, expiresAt: ISO}`.
   - `POST /api/leads/undo/:token`: if token valid and not expired, restores the lead (re-inserts), returns `{restored: true, leadId}`.
5. **Bulk delete undo**: `DELETE /api/leads` bulk returns same `{undoToken, expiresAt}`. Undo token covers all deleted lead IDs.
6. **Frontend — Undo toast**: after any delete (single or bulk) show a `UndoToast` component: "Lead șters · Undo (28s)" with countdown. On click → calls undo API → refetches pipeline. Toast disappears when timer hits 0 or undo is clicked.
7. **Frontend — Lead card audit timeline**: in `LeadCardPage`, inside the existing timeline/interactions tab, prepend audit entries (stage changes, field edits) as system interactions (greyed out, actor name + timestamp).
8. **Frontend — Audit log page** `/app/audit-log`: table with columns: Timestamp, Actor, Action, Lead name (link), Before/After (collapsible JSON). Filter bar: by actor (select), by action type (select). Paginate with "Load more".
9. Migration prefix `0010` — no collision with earlier migrations.
10. No raw `.execute().rows` — use query builder throughout.

## Files to create / modify

**Backend:**
- `server/db/schema/audit.ts` — crm_audit_log table
- `server/db/schema/index.ts` — export audit table
- `drizzle/0010_crm127_audit_log.sql` — hand-written migration
- `server/routes/audit.ts` — GET /api/audit-log
- `server/routes/leads.ts` — add audit writes, undo endpoints
- `server/index.ts` — register audit routes

**Frontend:**
- `src/lib/api/audit.ts` — typed API client
- `src/components/crm/UndoToast.tsx` — countdown toast component
- `src/pages/app/AuditLogPage.tsx` — audit log page
- `src/pages/app/LeadCardPage.tsx` — add audit entries to timeline
- `src/pages/app/LeadsPage.tsx` — wire undo token from delete response to UndoToast
- `src/router/HashRouter.tsx` — add `/app/audit-log` route
- `src/components/app/AppShell.tsx` — add "Audit Log" nav link

**Tests:**
- `src/__tests__/crm/audit.test.ts` — unit tests for audit writes + undo token lifecycle

## Tests

- T-CRM-127-1 `[blocant]` Given lead created via API, Then crm_audit_log has 1 row action='lead.created'.
- T-CRM-127-2 `[blocant]` Given lead stage changed, Then audit log row with before/after stage snapshots.
- T-CRM-127-3 `[blocant]` Given DELETE /api/leads/:id, Then returns undoToken; POST /api/leads/undo/:token restores lead.
- T-CRM-127-4 Given undo token used after 35s, Then 410 Gone.
- T-CRM-127-5 GET /api/audit-log returns rows newest-first, respects limit param.
- T-CRM-127-6 Build + typecheck + lint pass.
- T-CRM-127-7 Migration 0010_crm127_audit_log.sql committed.

## DoD

- All acceptance criteria met.
- Migration `0010_crm127_audit_log.sql` committed.
- Build + typecheck + lint green.
- Unit tests green.
- Reviewer APPROVED.
- Persona reports saved.
- PR open on `feat/CRM-127-undo-audit`.
