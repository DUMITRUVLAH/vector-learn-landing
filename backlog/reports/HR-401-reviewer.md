# HR-401 Code Review — Cycle 1

## Verdict: APPROVED

### Design system
- PayrollPage uses bg-card, border-border, STATUS_BADGE tokens — all semantic
- No hardcoded hex

### TypeScript
- Zero any
- PayrollEntry explicit interface
- PayrollStatus union type
- PayrollBreakdownItem interface in schema

### Accessibility
- Month picker has label + htmlFor
- Status select has aria-label per row
- Expand button has aria-label + aria-expanded
- Payroll table data-testid for testing

### Integration
- CONNECTED: payrollEntries → tenants + teachers + lessons (all existing)
- Calculate: queries lessons.status=completed in month × hourlyRateCents + commissionPct
- Upsert pattern: creates or updates per teacher per month
- Tenant-scoped
- Route /api/hr/payroll registered

### Migration
- 0011_hr401_payroll.sql with IF NOT EXISTS guards (safe for both fresh and existing DBs)
- Applied to Supabase successfully
