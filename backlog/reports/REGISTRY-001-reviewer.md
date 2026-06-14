---
item: REGISTRY-001
cycle: 1
verdict: APPROVED
date: 2026-06-14
---

## code-reviewer-vl — REGISTRY-001 FinDesk Tax Rates + Chart of Accounts

### Verdict: APPROVED

### Schema design
- fin_tax_rates: versioned by effectiveFrom/effectiveTo — correct pattern for fiscal rate changes
- tenantId nullable (global seed vs tenant override) — sound multi-tenant design
- isDefault flag on VAT rates — allows rateAt() to select the "main" rate without ambiguity
- fin_chart_of_accounts: parentCode for hierarchy, country-scoped, unique(tenantId, accountCode, country)
- No hardcoded enums that will drift — finTaxKindEnum and finAccountTypeEnum are pgEnums

### Code quality
- rateAt() follows a clear lookup hierarchy (tenant-specific → global seed)
- Seed data separated from helper (server/lib/finRegistry.ts) — importable in tests without side effects
- seedFinRegistry() is idempotent (try/catch on duplicate insert)
- TypeScript: InferInsertModel<typeof finTaxRates> for seed type — correct pattern

### Notes
- ITPARK-701/702 routes were unmounted on main; fixed as part of this item (pre-existing gate failure)
- No UI in this item — data layer only, per REGISTRY-001 spec
- Migration 0117 hand-written (drizzle generate unreliable on parallel branches) — correct approach
