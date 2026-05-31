---
id: CRM-126
slug: followup-cadence
phase: H
depends_on: [CRM-110, CRM-108]
milestone: CRM
---

# CRM-126 — Follow-up cadence: serie automatizată de follow-up-uri

## Goal

Allow academy staff to define multi-step follow-up sequences (cadences) that automatically send messages
and create tasks at configurable intervals after a lead enters a stage. A cadence is distinct from
one-shot automations: it is a *sequence* of timed steps (Day 1 → Day 3 → Day 7) that keep working
until the lead replies, converts, or the cadence is paused.

## User stories

- **US-CRM-126-1**: As a sales manager I want to create a cadence with N steps (each step = delay +
  action: send template OR create task), so that every new lead in a stage automatically gets
  follow-up at the right intervals without manual effort.
- **US-CRM-126-2**: As a staff member I want to see on a lead card which cadence step is next and
  when, so I know the lead is being nurtured automatically.
- **US-CRM-126-3**: As an admin I want cadences to auto-pause when a lead replies (any inbound
  interaction logged) or is converted, so we don't spam warm leads.

## Acceptance criteria

1. **DB**: new table `cadences` (id, tenant_id, name, trigger_stage varchar(64), enabled bool, steps JSONB, created_at).
   `steps` is an array of `{ delay_days: number, action: "send_template" | "create_task", template_id?: uuid, task_title?: string }`.
2. **DB**: new table `lead_cadence_enrollments` (id, tenant_id, lead_id FK, cadence_id FK, enrolled_at, current_step int default 0, status enum: active|paused|completed|cancelled, next_fire_at timestamp, updated_at).
3. **API `POST /api/cadences`**: create cadence (auth required, tenant-scoped).
4. **API `GET /api/cadences`**: list cadences for tenant.
5. **API `PATCH /api/cadences/:id`**: update (name, steps, enabled, trigger_stage).
6. **API `DELETE /api/cadences/:id`**: soft-delete (enabled=false).
7. **Auto-enroll**: when a lead's stage changes to `trigger_stage`, enroll the lead in all active cadences matching that stage (called from leads route `PATCH /api/leads/:id/stage`).
8. **Cadence cron**: `POST /api/cadences/tick` (internal, no auth header but requires `X-Internal-Key` header matching `process.env.INTERNAL_KEY ?? "dev"`) — advances enrollments whose `next_fire_at <= now()`:
   - Executes the step's action (logs a lead_interaction OR creates a lead_task).
   - Increments `current_step`; if all steps done → status=`completed`.
   - Sets `next_fire_at` to now + next step's delay_days.
9. **Auto-pause**: when a new `leadInteraction` is created with `direction=inbound`, set all active enrollments for that lead to `status=paused`.
10. **Lead card UI**: in the `LeadCardPage`, show a "Cadence" section in the sidebar: which cadence is active, current step number / total steps, next fire date. Show "Pause" button.
11. **Cadences list UI**: new page `/app/cadences` accessible from the sidebar — table of cadences with columns: name, trigger_stage, steps count, active enrollments count, enabled toggle.
12. **Cadences form UI** (on the `/app/cadences` page): inline "New cadence" form (collapsible) with fields: name, trigger_stage (select: new/contacted/trial), steps builder (add/remove steps, set delay_days, action type, template select or task title).
13. Migration prefix `0009` — no collision with 0008.

## Files to create / modify

**Backend:**
- `server/db/schema/cadences.ts` — new schema
- `server/db/schema/index.ts` — export cadences tables
- `drizzle/0009_crm126_cadences.sql` — hand-written migration (no db:generate needed, see DoD)
- `server/routes/cadences.ts` — CRUD + tick endpoint
- `server/index.ts` — register `/api/cadences` routes; call auto-pause hook in leads route

**Frontend:**
- `src/lib/api/cadences.ts` — typed API client
- `src/pages/app/CadencesPage.tsx` — list + inline form
- `src/components/crm/CadencePanel.tsx` — sidebar panel for LeadCardPage
- `src/pages/app/LeadCardPage.tsx` — add CadencePanel to sidebar
- `src/router/HashRouter.tsx` — add `/app/cadences` route
- `src/components/app/AppShell.tsx` — add "Cadences" nav link

**Tests:**
- `src/__tests__/crm/cadences.test.ts` — unit tests for cadence logic + API smoke

## Tests

- T-CRM-126-1 `[blocant]` Given a POST /api/cadences with valid name + steps, Then 201 + cadence created.
- T-CRM-126-2 `[blocant]` Given a lead stage changes to trigger_stage, Then enrollment created with status=active, next_fire_at = enrolled_at + step[0].delay_days.
- T-CRM-126-3 `[blocant]` Given enrollment next_fire_at <= now, When /api/cadences/tick called, Then step action executed (interaction logged), current_step incremented.
- T-CRM-126-4 Given inbound interaction added to lead, Then active enrollment → paused.
- T-CRM-126-5 Given all steps completed, Then enrollment status = completed.
- T-CRM-126-6 Build + typecheck + lint pass.
- T-CRM-126-7 DB migration: 0009_crm126_cadences.sql exists and is committed.

## DoD

- All acceptance criteria met.
- Migration `0009_crm126_cadences.sql` committed (hand-written to avoid prefix collision).
- Build + typecheck + lint green.
- Unit tests green.
- Reviewer APPROVED.
- Persona reports saved.
- PR open on `feat/CRM-126-followup-cadence`.
