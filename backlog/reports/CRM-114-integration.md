# CRM-114 Integration Architecture Review

**Verdict: CONNECTED**

## Module connectivity

### DB → API → UI
- `leads.company` / `leads.deal_name`: ADD COLUMN NULL → optional B2B field
- `lead_contacts` table: full CRUD via `/api/leads/:id/contacts`
- Pipeline endpoint: `company` and `dealName` already in lead select (*)
- Kanban card: `lead.company` shown as subtitle; `lead.dealName ?? lead.fullName` as title
- LeadCardPage: company/dealName in edit panel + Contacts tab with full CRUD

### Migration notes
- CRM-114 branch migration 0007 covers value_cents/debt_cents (from CRM-113 not yet merged) + company + deal_name + lead_contacts
- When owner merges CRM-113 then CRM-114: migration 0007 from CRM-113 runs first (value_cents/debt_cents), then migration 0007 from CRM-114 would conflict — owner should squash or rebase CRM-114 migration to be 0008 after merging CRM-113

### Tenant safety
- `getLeadForTenant()` helper validates lead ownership before all contact operations
- All contact queries filter by `tenantId`

### Primary constraint
- Server enforces at most one `is_primary=1` per lead in POST/PATCH
- Client updates local state optimistically

## No gaps found.
