# FISC-002 — Integration Architect Report

**Item**: FISC-002 — Motor TVA determinist
**Verdict**: CONNECTED

## Integration assessment

### Routes
- `POST /api/fin/tax/calculate` — montat, autentificat, filtrează după tenant_id
- `GET /api/fin/tax/periods` — cu declarații nested via Drizzle relations
- `PATCH /api/fin/tax/declarations/:id/file` — marchează ca depusă

### Data flow
- Calculator acceptă `invoiceLines` și `expenseLines` ca input direct (independent de BILL/SPEND branches)
- Fallback la `fin_invoices`/`fin_expenses` via raw SQL cu try/catch — robust când tabelele nu există
- Payload stocat în `fin_tax_declarations.payload` JSONB — consumat de FISC-003 (generator declarații)

### Tenant isolation
- Toate query-urile: `where: { tenantId }` sau `eq(finTaxPeriods.tenantId, tenantId)`
- Nicio scurgere cross-tenant

### Competing systems
- Nu există altă implementare de calcul TVA în codebase
- `accountingExport.ts` e un export helper (SAGA/1C), nu calcul fiscal — nu interferă

## Verdict: CONNECTED
Motor fiscal integrat corect cu schema FISC-001. FISC-003 poate consuma payload-ul.
