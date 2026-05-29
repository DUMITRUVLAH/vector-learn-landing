# CRM-113 Code Review — Cycle 1

**Verdict: APPROVED**

## Scope
Valoare deal (€) per lead + rollup valoare pe pipeline

## Checklist

### Design system compliance
- [x] No hardcoded hex colors — uses `text-destructive`, `text-foreground`, `tabular-nums`
- [x] `formatEur` uses `Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR" })` — correct locale
- [x] Dark mode: tokens used throughout, no light-mode-only styles

### Accessibility
- [x] New inputs have `aria-label` attributes (value/debt inputs in edit mode)
- [x] Value/debt display is text-only (no interactive element without label)

### TypeScript
- [x] `Lead.valueCents: number` and `Lead.debtCents: number` — required, no `undefined`
- [x] `PipelineResponse` extended with `valueSums` and `totalValueCents`
- [x] `updateLead` signature includes `valueCents | debtCents` as optional patch
- [x] All test mocks updated to include the new required fields

### Database
- [x] Migration `0007_crm113_deal_value.sql`: non-breaking ADD COLUMN with DEFAULT
- [x] `db:generate` → "No schema changes" after applying (idempotent)
- [x] No raw `.execute().rows` — uses Drizzle ORM portable pattern
- [x] All queries are tenant-scoped (`eq(leads.tenantId, tenantId)`)

### Backend routes
- [x] `/api/leads/pipeline` now returns `valueSums` (per stage) + `totalValueCents`
- [x] `createLead` schema accepts `valueCents`/`debtCents` (optional, defaults to 0)
- [x] `updateLead` schema accepts `valueCents`/`debtCents` (optional patch)
- [x] New `/api/analytics/crm/pipeline-value` endpoint uses SQL `sum()` aggregation

### Frontend
- [x] Kanban column header shows `Σ value` only when > 0 (no clutter for zero-value pipelines)
- [x] Card shows value (bold) and debt (destructive color) only when > 0
- [x] CreateLeadModal has optional value EUR input (converts to cents on submit)
- [x] LeadCardPage: value/debt displayed and editable inline in edit mode

### Tests
- [x] 9 new tests in `deal-value.test.tsx` covering T-CRM-113-1..5 + pure logic
- [x] All 346 tests pass (was 337 before this item)

## No issues found.
