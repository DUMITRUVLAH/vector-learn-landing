---
id: FISC-002
title: "Motor TVA determinist: colectat[BILL] − deductibil[SPEND], impozit venit, rate din REGISTRY"
milestone: FIN
phase: "10"
status: pending
depends_on: [FISC-001, BILL-002, SPEND-002]
spec: backlog/specs/FISC-002.md
branch: feat/FIN-fisc
---

## Goal

Implementează motorul de calcul fiscal DETERMINIST (nu AI — FIN-CORE regula #4) care:

1. **TVA colectat** = suma TVA de pe facturile emise (`fin_invoices`) în perioadă, grupate pe cotă
2. **TVA deductibil** = suma TVA de pe cheltuielile (`fin_expenses`) cu drept de deducere în perioadă
3. **TVA de plată** = TVA colectat − TVA deductibil (poate fi negativ → ramburs)
4. **Impozit venit** = baza impozabilă × cota din REGISTRY (diferit MD vs RO)

Cotele TVA provin din `fin_registry_items` (nu hardcodate). Rezultatele se stochează în
`fin_tax_declarations.payload` ca JSONB — nu recalculate la fiecare request.

Backend expune `POST /api/fin/tax/calculate` și `GET /api/fin/tax/periods/:id/summary`.

---

## User stories

- Ca **contabil**, vreau să apăs un buton „Calculează" pentru o perioadă fiscală și să obțin automat TVA colectat, deductibil și de plată, pentru că calculul manual din zeci de facturi durează ore și e supus greșelilor.
- Ca **director financiar**, vreau să văd impozitul pe venit estimat al perioadei, pentru că trebuie să rezerv lichiditate pentru plată.
- Ca **contabil**, vreau ca calculul să folosească cotele TVA din registru (nu hardcodate în cod), pentru că cota poate varia per produs/serviciu și per jurisdicție (MD 20%, RO 19%/9%/5%).
- Ca **auditor intern**, vreau să văd detaliul calculului (facturi incluse, cheltuieli incluse, cotă aplicată), pentru că trebuie să pot justifica fiecare cifră.

---

## Acceptance criteria

- [ ] `POST /api/fin/tax/calculate` acceptă `{period_id, declaration_type}` și calculează determinist
- [ ] Calcul TVA colectat: SUM(invoice.vat_cents) per cotă (20%, 19%, etc.) pentru facturi cu `issued_date` în perioadă și `status IN ('sent','paid')`
- [ ] Calcul TVA deductibil: SUM(expense.vat_deductible_cents) pentru cheltuieli cu `expense_date` în perioadă și `deductible = true`
- [ ] TVA de plată = colectat − deductibil (stocat în payload)
- [ ] Calcul impozit venit: `(total_revenue_cents − total_expense_cents) × income_tax_rate_bp / 10000` — cota din REGISTRY (cheie `income_tax_rate_bp`)
- [ ] Rezultatele stocate în `fin_tax_declarations.payload` ca JSONB: `{vat_collected_cents, vat_deductible_cents, vat_due_cents, income_tax_base_cents, income_tax_cents, rate_pct, calculated_at, invoice_count, expense_count}`
- [ ] Declarația trece la `status = 'ready'` după calcul reușit
- [ ] `GET /api/fin/tax/periods` returnează lista perioadelor cu sumarul fiecărei declarații
- [ ] `GET /api/fin/tax/periods/:id/summary` returnează payload-ul detaliat al declarației
- [ ] Calcul este idempotent: rulat de N ori pe aceeași perioadă produce același rezultat (se suprascrie payload-ul existent)
- [ ] Dacă nu există facturi sau cheltuieli în perioadă → payload cu zerouri, nu eroare
- [ ] Tenant isolation: calculul folosește doar datele tenant-ului autentificat
- [ ] AI nu intervine în nicio parte a calculului (regula #4)

---

## Files to create / modify

**Create:**
- `server/lib/fin/taxCalculator.ts` — motor calcul TVA + impozit venit, 100% determinist
- `server/routes/finTax.ts` — rutele `/api/fin/tax/*`

**Modify:**
- `server/app.ts` — montează `finTaxRoutes` la `/api/fin/tax`

---

## Tests

- **T-FISC-002-1** [blocant] Given server pornit, When `POST /api/auth/login` + `POST /api/fin/tax/calculate`, Then răspuns 200 cu payload valid
- **T-FISC-002-2** [blocant] Given 3 facturi cu TVA=20% total 1000 lei + 2 cheltuieli deductibile TVA=200 lei, When calculate, Then `vat_due_cents = 800 * 100`
- **T-FISC-002-3** [blocant] Given router finTaxRoutes, When montat în app.ts, Then `GET /api/fin/tax/periods` → 200 (nu 404/HTML)
- **T-FISC-002-4** [normal] Given calcul rulat de 2 ori pe aceeași perioadă, When al doilea calculate, Then payload suprascris, nu duplicat
- **T-FISC-002-5** [normal] Given perioadă fără facturi, When calculate, Then payload `{vat_collected_cents: 0, vat_deductible_cents: 0, vat_due_cents: 0, ...}` — nu eroare
- **T-FISC-002-6** [normal] Given tenant_id diferit, When GET /api/fin/tax/periods, Then vede doar datele proprii

---

## Definition of Done

- Motor taxCalculator.ts cu funcții pure, testabile
- Rute montate în app.ts (`/api/fin/tax`)
- Calcul TVA + impozit venit corect per formulă deterministă
- T-FISC-002-1..3 verde (blocante)
- Zero AI în calcul fiscal
