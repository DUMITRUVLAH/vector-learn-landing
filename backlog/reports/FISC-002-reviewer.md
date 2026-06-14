# FISC-002 — Code Review

**Item**: FISC-002 — Motor TVA determinist: colectat[BILL] − deductibil[SPEND], cote din REGISTRY
**Cycle**: 1
**Verdict**: APPROVED

## Checks

### Design system / a11y
- No UI components — N/A

### TypeScript
- `taxCalculator.ts`: zero `any`, toate tipurile explicite (`TaxLineItem`, `TaxCalculationInput`, `TaxCalculationResult`)
- `finTax.ts` (routes): zValidator cu schema Zod, tipuri Hono Variables corecte
- Import paths corecte
- `db.query.finTaxPeriods.findMany` cu `with: { declarations }` — relația Drizzle definită corect

### Architecture
- **Dependency injection** pentru linii facturi/cheltuieli: calculatorul acceptă date direct ca parametri → testabil fără DB real
- **Graceful degradation**: dacă `fin_invoices`/`fin_expenses` nu există (ramuri nemergate), query eșuează în catch și continuă cu date goale — nu blochează
- **Idempotent**: `POST /calculate` suprascrie payload-ul existent → nu creează duplicate

### Calcul fiscal
- TVA colectat = SUM(vatCents) per invoice line — corect
- TVA deductibil = SUM(vatCents) per expense line cu `deductible: true` — corect
- TVA de plată = colectat − deductibil (poate fi negativ = ramburs) — corect
- Impozit venit = max(0, baza) × cota (pierderea nu generează impozit) — corect
- AI zero — regula #4 respectată

### Routes
- `requireAuth` pe toate rutele — tenant isolation enforced
- `finTaxRoutes` montat în `app.ts` la `/api/fin/tax` — check-route-mounts PASS

### Migration
- Relations adăugate în schema pentru `with:` queries
- Snapshot actualizat

## Findings
Niciuna. Implementarea este curată.
