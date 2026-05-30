---
id: FIN-604
title: "e-Factura export stub (UBL 2.1 XML) + export SAGA CSV"
milestone: FIN
phase: "4 — e-Factura & Export"
priority: P0
slug: efactura-stub
depends_on: [FIN-601]
status: pending
---

# FIN-604 — e-Factura export stub + export SAGA/contabilitate

## Goal

Contabila poate exporta orice factură în format XML UBL 2.1 (compatibil SPV-ANAF) și poate
descărca lista plăților lunii în format CSV compatibil SAGA. Trimiterea reală la ANAF e un
stub (log + status `pending_efactura`) — integrarea completă vine când tenantul activează
credentialele SPV.

## In scope

- `GET /api/invoices/:id/efactura` — generează XML UBL 2.1 minimal pentru factura respectivă:
  - `<Invoice>`, `<ID>`, `<IssueDate>`, `<InvoiceLine>` cu cantitate + preț
  - Câmpuri obligatorii ANAF: CUI furnizor (din tenant settings), serie factură, valoare
  - Returnează `Content-Type: application/xml` cu `Content-Disposition: attachment`
  - Setează `invoices.efactura_status = 'pending'` (coloana nouă — migrare 0014)
- `GET /api/invoices/export/saga-csv` — query params: `month` (YYYY-MM)
  - Returnează CSV cu coloane: Nr, Data, Client, CUI/CNP, Descriere, Valoare fara TVA, TVA 19%, Total, Status
  - `Content-Type: text/csv`, `Content-Disposition: attachment; filename=saga-YYYY-MM.csv`
- UI `/app/invoices`:
  - Buton „e-Factura XML" per rând factură issued (icon download)
  - Buton „Export SAGA CSV" (global, lângă filtru lună) → descarcă CSV-ul lunii filtrate
- Migrare 0014: `ALTER TABLE invoices ADD COLUMN efactura_status VARCHAR(30) DEFAULT NULL`
- Schema `tenant_settings` (opțional): coloana `cui` VARCHAR(20), `company_name` VARCHAR(200)
  dacă nu există deja — sau hardcodat „VECT SRL" în XML stub (se documentează limitarea)

## Out of scope

- Trimitere reală la ANAF (necesită credentiale SPV + OAUTH — US-PAY-08)
- Apple Pay / Google Pay
- Dispute & chargeback

## User stories

- US-PAY-08: e-Factura ANAF (stub)
- US-PAY-18: Export contabilitate (SAGA)

## Acceptance criteria

- [ ] GET /api/invoices/:id/efactura → 200 cu XML valid (parsabil de DOMParser)
- [ ] XML conține `<Invoice>`, `<ID>` cu invoiceNumber, `<IssueDate>`, cel puțin un `<InvoiceLine>`
- [ ] `invoices.efactura_status` setat la `pending` după export
- [ ] GET /api/invoices/export/saga-csv?month=2026-05 → 200 CSV cu header corect
- [ ] CSV conține rânduri pentru facturile din luna dată (tenant-scoped)
- [ ] Buton „e-Factura XML" vizibil în tabel facturi (issued/paid rows)
- [ ] Buton „Export SAGA CSV" descarcă fișierul
- [ ] Migrare 0014 commitată, db:reset+db:seed succed

## Files

### New
- `drizzle/0014_fin604_efactura_status.sql`
- `server/lib/efactura.ts` — funcție `generateUBL21(invoice, tenant): string` (pure function)
- `src/lib/sagaCsv.ts` — sau inline în route

### Modified
- `server/db/schema/invoices.ts` — add `efacturaStatus`
- `server/routes/invoices.ts` — add GET /:id/efactura + GET /export/saga-csv
- `src/pages/InvoicesPage.tsx` — butoane e-Factura + SAGA

## Tests

1. [blocant] Migration gate: 0014 commitată, db:reset+db:seed succed
2. [blocant] GET /api/invoices/:id/efactura → 200, Content-Type application/xml, body parsabil ca XML
3. [blocant] XML conține tag `<Invoice>` cu `<ID>` = invoiceNumber facturii
4. [blocant] efactura_status setat la `pending` pe invoice după export
5. [blocant] GET /api/invoices/export/saga-csv?month=2026-05 → 200, Content-Type text/csv
6. [blocant] CSV header: primele coloane includ „Nr" și „Data"
7. [blocant] CSV conține doar facturi ale tenantului curent
8. [normal] generateUBL21() unit test: input invoice obiect → output string conține `<InvoiceLine>`
9. [normal] Buton e-Factura apare în tabel (InvoicesPage test)

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.
