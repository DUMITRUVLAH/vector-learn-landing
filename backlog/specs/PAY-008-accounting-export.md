---
id: PAY-008
title: "Export contabilitate SAGA/1C — CSV lunar cu mapping articole contabile"
milestone: PAY
phase: "3"
status: pending
depends_on: [PAY-007]
slug: accounting-export
---

## Goal

Permite contabililor să exporte toate tranzacțiile lunii (plăți, refunduri, salary payouts) în format
CSV compatibil cu SAGA și 1C/Mentor Contabil — software-urile de contabilitate folosite de 80% din
IMM-urile românești. Mappingul dintre tipul tranzacției și articolul contabil e configurabil per-tenant.
Export-ul e descărcabil direct din UI fără a necesita intervenție IT.

## User stories

- **US-1**: Ca Accountant, vreau să export tranzacțiile lunii în CSV SAGA, pentru că le importez direct fără re-tastare.
- **US-2**: Ca Director, vreau să configurez codul contabil pentru fiecare tip de tranzacție (taxă curs, refund, salariu), pentru că CPA-ul meu are propria schemă de conturi.
- **US-3**: Ca Admin, vreau să export și tranzacțiile anterioare (orice lună din 2024+), pentru că trebuie să regenerez rapoartele pentru audit.
- **US-4**: Ca Accountant, vreau ca refundurile să apară ca intrări negative în export, pentru că altfel totalul nu bate.

## Acceptance criteria

- [ ] AC1: `GET /api/accounting/export?month=2026-06&format=saga` → download CSV cu coloane: `data`, `tip` (PL/NC etc.), `articol_contabil`, `descriere`, `suma`, `moneda`, `nr_document`, `partener`. UTF-8 cu BOM (Excel RO).
- [ ] AC2: Format SAGA: fiecare plată → rând `PL` (plată client), fiecare refund → rând `NC` (notă credit), fiecare payout (salariu) → rând `DP` (dispoziție plată).
- [ ] AC3: Tabel `accounting_mappings` — (id, tenant_id, transaction_type: payment/refund/payout, account_code TEXT, description_template TEXT). CRUD via `GET/POST/PUT /api/accounting/mappings`.
- [ ] AC4: UI — pagina `/app/accounting` (sau tab în `/app/payments`): selector lună/an, selector format (SAGA / 1C), buton Download. Preview count tranzacții + suma totală înainte de download.
- [ ] AC5: `GET /api/accounting/export?format=1c` → format 1C (tab-separated, altă ordine coloane, fără BOM). Coloanele: `Дата`, `Документ`, `Контрагент`, `Сумма`, `Валюта`, `Примечание`.
- [ ] AC6: Export include și TVA split dacă configurabil (coloana `tva_amount` separată, adăugată la rândul de plată).
- [ ] AC7: `GET /api/accounting/summary?month=2026-06` → `{income: N, refunds: N, payouts: N, net: N, transactions_count: N}` — pentru preview înainte de download.

## Files to create / modify

- `server/db/schema/accountingMappings.ts` — tabel `accounting_mappings`
- `server/routes/accounting.ts` — export + mappings CRUD + summary
- `server/lib/accountingExport.ts` — logica generare CSV SAGA și 1C
- `src/pages/AccountingPage.tsx` — UI export cu selector lună + format + preview
- `src/components/settings/AccountingMappingsForm.tsx` — configurare conturi
- `drizzle/0036_pay008_accounting_mappings.sql` — migrare

## Tests

- **T-PAY-008-1** [blocant] Given plăți în baza de date pentru luna 2026-06, When GET /api/accounting/export?month=2026-06&format=saga, Then răspuns 200 cu Content-Type text/csv, primul rând = header SAGA cu coloanele corecte.
- **T-PAY-008-2** [blocant] Given un refund în luna exportată, Then în CSV apare un rând cu suma negativă și tip NC.
- **T-PAY-008-3** [blocant] Given API smoke — boot server, POST /api/auth/login → 200, GET /api/accounting/summary?month=2026-06 → 200 cu {income, net}.
- **T-PAY-008-4** [normal] Given lună fără tranzacții, When GET /api/accounting/export, Then CSV cu doar header (nu eroare).
- **T-PAY-008-5** [normal] Given format=1c, When GET /api/accounting/export?format=1c, Then tab-separated, fără BOM, coloane în format 1C.

## Definition of Done

- [ ] Migrare SQL commitată și `db:reset && db:seed` trec
- [ ] Toate testele T-PAY-008-* trec
- [ ] CSV SAGA descărcabil cu date corecte
- [ ] Pagina Accounting funcțională cu preview și download
- [ ] Reviewer APPROVED, integration-architect CONNECTED
