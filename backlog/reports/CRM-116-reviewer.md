# CRM-116 Code Review — Cycle 1

**Verdict: APPROVED**

## Scope
Semnale de task pe card — „Fără task" + aging restanță + filtre

## Checklist

### Design system compliance
- [x] "Fără task" badge: `text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30` — semantic warning tokens
- [x] Overdue badge: `text-destructive` — semantic token (no hardcoded hex)
- [x] Dark mode: amber + dark mode variant defined for both states

### Accessibility
- [x] "Fără task" badge has `aria-label="Lead fără task deschis"`
- [x] Overdue badge has `aria-label="Task restant X zile"`
- [x] Filter checkboxes have `aria-label` attributes
- [x] `<label>` wraps each checkbox for proper touch target

### TypeScript
- [x] `nextTask?.dueAt!` — non-null assertion guarded by `isOverdue` check before use
- [x] No `any` types introduced
- [x] Filter state types are `boolean`

### Business logic
- [x] `nextTask === null` (from pipeline endpoint) correctly signals "no open task"
- [x] Days overdue: `Math.floor((Date.now() - new Date(dueAt).getTime()) / 86400000)` — correct integer day calculation
- [x] "Fără task" and "Restanțe" filters are mutually exclusive (checking one unchecks the other)
- [x] Filter reset button now resets both new filters

### No migration needed
- Pure frontend change — reuses `nextTask` already returned by `/api/leads/pipeline`

### Tests
- [x] 8 new tests in `task-signals.test.tsx` covering T-CRM-116-1..4 + pure logic
- [x] All 345 tests pass (on main branch; +8 from this item)

## No issues found.
