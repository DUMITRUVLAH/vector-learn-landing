# CRM-126 — Integration Architecture Review

**Verdict: CONNECTED**

## Cross-module connections verified

### DB wiring
- `cadences` table FK → `tenants.id` ON DELETE CASCADE ✓
- `lead_cadence_enrollments` FK → `tenants.id`, `leads.id`, `cadences.id` all ON DELETE CASCADE ✓
- Indexes: fire_idx on (status, next_fire_at) enables efficient tick query ✓

### API wiring
- `cadenceRoutes` registered at `/api/cadences` in `server/app.ts` ✓
- Auth: all routes require auth via `requireAuth` middleware except `/tick` (protected by X-Internal-Key) ✓

### CRM integration hooks
- `enrollLeadInCadences()` called in `PATCH /api/leads/:id/stage` (fire-and-forget) ✓
- `pauseEnrollmentsOnReply()` called in `POST /api/leads/:id/interactions` when direction=inbound ✓

### Frontend wiring
- `/app/cadences` route added in `App.tsx` ✓
- `CadencesPage` uses `listCadences()` + `listTemplates()` ✓
- `CadencePanel` uses `getLeadEnrollments()` + `pauseEnrollment()` ✓
- `LeadCardPage` imports and renders `CadencePanel` in sidebar ✓
- `AppShell` nav includes "Cadences" link ✓

### Tenant safety
- All DB queries filter by `tenantId` from authenticated session ✓
- Tick endpoint uses X-Internal-Key (not tied to a specific tenant — processes all) ✓
- Enrollment auto-pause only affects enrollments for the specific lead's tenant ✓

### Data flow
lead → stage change → enrollLeadInCadences → enrollment created → tick → step action (interaction/task) → inbound reply → pause enrollment
