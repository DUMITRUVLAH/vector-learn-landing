# CRM-114 Code Review — Cycle 1

**Verdict: APPROVED**

## Scope
Companie + contacte multiple per lead (B2B) + nume deal

## Checklist

### Design system compliance
- [x] Company shown as italic muted text on kanban card — `text-muted-foreground italic`
- [x] Primary contact badge uses `bg-primary/10 text-primary` — semantic tokens
- [x] No hardcoded hex colors
- [x] Dark mode: all tokens work in dark

### Accessibility
- [x] All inputs in ContactsTab have `aria-label` attributes
- [x] Contact list has `aria-label="Lista contacte"`
- [x] Delete button has `aria-label` with contact name
- [x] Tab panel has `role="tabpanel"` with `aria-label`

### TypeScript
- [x] `company?: string | null` and `dealName?: string | null` — optional in frontend Lead interface (not required since most leads are B2C)
- [x] `company: string | null` in server schema (nullable varchar)
- [x] `LeadContact` interface defined and exported
- [x] `ContactsTab` props interface correctly typed

### Database
- [x] Migration `0007_crm114_company_contacts.sql`: adds value_cents/debt_cents (from CRM-113, not yet in main) + company + deal_name + lead_contacts table
- [x] `lead_contacts.is_primary` uses integer(0/1) for portability
- [x] FK cascade on tenant_id and lead_id
- [x] `db:generate` → "No schema changes" after applying

### Backend routes
- [x] Contacts CRUD: GET/POST/PATCH/DELETE `/api/leads/:id/contacts`
- [x] Primary constraint enforced server-side (reset all to 0 before setting new primary)
- [x] All routes verify lead ownership via `getLeadForTenant()` (tenant-scoped)
- [x] Registered in `app.ts` under `/api` prefix

### Frontend
- [x] Kanban card: shows `company` as italic muted line when present; title uses `dealName ?? fullName`
- [x] LeadCardPage: company + dealName fields in left column (display + edit mode)
- [x] Contacts tab added to LeadCardPage tab bar
- [x] ContactsTab: list contacts, add new, delete, set primary
- [x] Page title uses `displayTitle = lead.dealName ?? lead.fullName`

### Tests
- [x] 8 new tests in `company-contacts.test.tsx` covering T-CRM-114-1..4 + pure logic
- [x] All 345 tests pass

## No issues found.
