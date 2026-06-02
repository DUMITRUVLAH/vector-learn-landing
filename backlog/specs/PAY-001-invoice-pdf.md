---
id: PAY-001
title: "Facturi PDF cu serie incrementală (VECT-2026-XXXX) + buton descărcare"
milestone: PAY
phase: "2"
status: pending
depends_on: [MVP-007, FIN-601]
slug: invoice-pdf
---

## Goal

Generează facturi PDF cu serie incrementală (configurabilă în settings) și permite descărcarea din UI.
Fiecare factură primește un număr unic per tenant (`VECT-2026-0001`, `VECT-2026-0002`, …), generat atomic.

## User stories

- **US-1**: Ca Contabil, vreau să descarc factura ca PDF cu număr de serie, pentru că trebuie să o
  arhivez și trimit clientului.
- **US-2**: Ca Manager, vreau să configurez prefix-ul seriei (ex. "VECT-2026"), pentru că fiecare
  firmă are propria schemă de facturare.
- **US-3**: Ca Recepționer, vreau să văd numărul facturii în lista de plăți, pentru că îl comunic
  părintelui la telefon.

## Acceptance criteria

- [ ] AC1: `POST /api/payments` → dacă `status == "paid"` sau explicit, generează `invoice_number` unic atomic
  (format `{prefix}-{YYYY}-{NNNN padded 4}`).
- [ ] AC2: `GET /api/invoices/:id/pdf` → returnează un PDF cu: număr factură, dată, furnizor (tenant name),
  client (student name + parent), items (curs, lecții, perioadă), total, modalitate plată.
- [ ] AC3: Buton "Descarcă PDF" în lista de plăți → declanșează download în browser.
- [ ] AC4: Serie configurabilă în Settings (`invoice_prefix`, default `"VECT"`).
- [ ] AC5: Counter atomic per tenant (nu duplicate dacă 2 req paralele).
- [ ] AC6: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/routes/invoicePdf.ts` — endpoint GET /api/invoices/:id/pdf
- `server/lib/pdfGenerator.ts` — generare HTML→PDF cu `html-to-text` sau template simplu
- `src/__tests__/pay/invoice-pdf.test.ts`
- `server/__tests__/invoice-pdf.routes.test.ts`

### Modified
- `server/db/schema/index.ts` — adaugă `invoice_number` (text, unique per tenant) + `invoice_prefix` în tenant settings
- `server/routes/payments.ts` — generare number la create
- `src/pages/app/PaymentsPage.tsx` — buton PDF
- `drizzle/0031_pay001_invoice_number.sql` (generat prin db:generate)

## Tests

- **T-PAY-001-1** `[blocant]` Given o plată existentă, When GET /api/invoices/:id/pdf, Then 200 cu Content-Type application/pdf și dimensiune > 0.
- **T-PAY-001-2** `[blocant]` Given 2 cereri simultane de creare plată, When ambele commit, Then invoice_number-urile sunt distincte (nu duplicate).
- **T-PAY-001-3** `[blocant]` Given tenant A, When GET /api/invoices/:id/pdf unde id e al tenant B, Then 403.
- **T-PAY-001-4** `[blocant]` Migration gate: db:reset + db:seed trece după migrare.
- **T-PAY-001-5** [normal] Given prefix "ACAD", When se creează plată, Then invoice_number e "ACAD-2026-0001".

## Definition of Done

- [ ] AC1-AC6 implementate
- [ ] T-PAY-001-1..5 trec
- [ ] Build + typecheck + lint + test verzi
- [ ] Migration commitată + db:reset + db:seed verzi
- [ ] API smoke: login + GET /api/invoices/:id/pdf → 200 PDF
