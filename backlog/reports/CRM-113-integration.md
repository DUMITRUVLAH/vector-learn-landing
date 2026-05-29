# CRM-113 Integration Architecture Review

**Verdict: CONNECTED**

## Feature
CRM-113 — Valoare deal (€) per lead + rollup valoare pe pipeline

## Module connectivity

### DB → API → UI wiring
- `leads.value_cents` / `leads.debt_cents` added via migration 0007
- `GET /api/leads/pipeline` → returns `valueSums[stageKey]` + `totalValueCents` (computed in JS from already-loaded leads)
- `PATCH /api/leads/:id` → accepts `valueCents`/`debtCents` patch — tenant-scoped
- `POST /api/leads` → accepts `valueCents`/`debtCents` on create

### UI wiring
- `LeadsPage`: `valueSums` state pulled from pipeline response; column headers render `formatEur(valueSums[stage.key])` when > 0; `KanbanCard` renders value/debt
- `LeadCardPage`: inline edit mode exposes value/debt number inputs; `editDraft` includes both fields
- `CreateLeadModal`: optional EUR input converts to cents on submit

### Analytics integration
- New `/api/analytics/crm/pipeline-value` endpoint provides `stages[].valueCents` for weighted pipeline view (extends CRM-112 analytics)
- No changes to existing funnel/ROAS/lost-reason logic

### Foreign keys / tenant safety
- No new FK relationships needed (value is a property of `leads`)
- All queries scoped to `tenantId` — no cross-tenant leakage

### Cross-module data flow
- Conversion flow (CRM-111): `leads.valueCents` is preserved when lead converts to student — no pipeline value lost
- Analytics (CRM-112): pipeline-value endpoint is additive, existing analytics unaffected

## No gaps found.
