# FISC-003 — Integration Architect Report

**Item**: FISC-003 — Generare declarații PDF+CSV + pagina /app/fin/tax
**Verdict**: CONNECTED

## Integration assessment

### Route wiring
- `GET /api/fin/tax/declarations/:id/export` — montat, autentificat
- Consumă `fin_tax_declarations.payload` (produs de FISC-002)
- Returnează `application/pdf` sau `text/csv; charset=utf-8` cu header Content-Disposition

### Data flow
- `FISC-001` → creare perioade + declarații (schema)
- `FISC-002` → calcul TVA, payload stocat în `fin_tax_declarations.payload`
- `FISC-003` → citire payload, generare PDF/CSV pentru descărcare

Lanțul FISC-001 → FISC-002 → FISC-003 este complet și coerent.

### UI wiring
- `TaxPage.tsx` importat în `App.tsx` la ruta `/app/fin/tax`
- Apeluri API: `GET /api/fin/tax/periods` (cu declarații nested), `POST /api/fin/tax/calculate`, `PATCH /api/fin/tax/declarations/:id/file`

### Tenant isolation
- Toate rutele filtrează după `tenant_id` — moștenit din FISC-002

### Competing systems
- Nu există altă pagină de declarații fiscale în codebase

## Verdict: CONNECTED
Lanțul complet funcțional. Pagina /app/fin/tax conectată la API.
