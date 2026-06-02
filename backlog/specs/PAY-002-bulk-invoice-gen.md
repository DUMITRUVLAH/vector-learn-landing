---
id: PAY-002
title: "Generare bulk facturi lunare pentru toți elevii activi"
milestone: PAY
phase: "2"
status: pending
depends_on: [PAY-001]
slug: bulk-invoice-gen
---

## Goal

Permite generarea cu un singur click a facturilor lunare pentru toți elevii activi ai tenantului.
Managerul selectează luna/an, confirmă count + total estimat, și sistemul creează facturile în background.

## User stories

- **US-1**: Ca Admin, vreau să generez toate facturile lunii cu un singur click, pentru că nu vreau
  să creez 200 de facturi manual.
- **US-2**: Ca Director, vreau să văd un preview cu numărul de elevi și suma totală înainte de
  confirmare, pentru că vreau să validez că totul e corect.
- **US-3**: Ca Contabil, vreau ca facturile generate să aibă numere de serie consecutive, pentru că
  ANAF cere secvențialitate.

## Acceptance criteria

- [ ] AC1: Buton "Generează facturi luna curentă" în `/app/payments` (sau subpagina invoices).
- [ ] AC2: `POST /api/invoices/bulk-generate` cu `{month: "2026-06", dryRun: true}` → returnează
  `{count, totalAmount, alreadyInvoiced}` fără a crea nimic.
- [ ] AC3: `POST /api/invoices/bulk-generate` cu `dryRun: false` → creează facturile, returnează
  `{created, skipped}`.
- [ ] AC4: Elevii cu plată existentă pentru luna respectivă sunt `skipped` (idempotent).
- [ ] AC5: Facturile generate primesc `invoice_number` secvențiale (PAY-001).
- [ ] AC6: tenant-safe; operație atomică (sau în batch cu rollback la eroare).

## Files

### New
- `server/routes/invoicesBulk.ts`
- `src/components/BulkInvoiceDialog.tsx`
- `src/__tests__/pay/bulk-invoice.test.ts`
- `server/__tests__/invoices-bulk.routes.test.ts`

### Modified
- `server/routes/index.ts` — mount invoicesBulk
- `src/pages/app/PaymentsPage.tsx` — buton + dialog

## Tests

- **T-PAY-002-1** `[blocant]` Given 5 elevi activi fără factură luna curentă, When POST bulk dryRun=true, Then count=5 și nici o factură creată.
- **T-PAY-002-2** `[blocant]` Given POST bulk dryRun=false, When succes, Then 5 facturi în DB cu numere consecutive.
- **T-PAY-002-3** `[blocant]` Given un elev deja facturat luna curentă, When POST bulk, Then acel elev e în skipped (nu duplică).
- **T-PAY-002-4** `[blocant]` Given tenant A, When POST cu tenant B token, Then 403.
- **T-PAY-002-5** [normal] Dialog UI: preview arată count și total corect înainte de confirmare.

## Definition of Done

- [ ] AC1-AC6 implementate
- [ ] T-PAY-002-1..5 trec
- [ ] Build + typecheck + lint + test verzi
- [ ] API smoke: login + POST /api/invoices/bulk-generate → 200
