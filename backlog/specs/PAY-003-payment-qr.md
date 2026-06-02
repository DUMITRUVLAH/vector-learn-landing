---
id: PAY-003
title: "QR de plată EPC069-12 în factură PDF + portal părinți"
milestone: PAY
phase: "2"
status: pending
depends_on: [PAY-001, PORTAL-902]
slug: payment-qr
---

## Goal

Adaugă un QR code EPC069-12 (standard european SEPA) pe facturile PDF și în portalul părinților.
Părintele scanează QR cu aplicația bancară (BT Pay, BCR George, Revolut, etc.) și câmpurile IBAN +
sumă + referință se completează automat.

## User stories

- **US-1**: Ca Părinte, vreau să scanez un QR din factură și să plătesc instant cu aplicația băncii,
  pentru că nu vreau să introduc IBAN-ul manual.
- **US-2**: Ca Manager, vreau să configurez IBAN-ul centrului în Settings, pentru că fiecare
  locație poate avea cont bancar diferit.
- **US-3**: Ca Contabil, vreau că QR-ul conține numărul facturii ca referință, pentru că identific
  ușor plata în extrasul de cont.

## Acceptance criteria

- [ ] AC1: Settings → câmpuri `tenant.iban`, `tenant.bic` (opțional).
- [ ] AC2: `GET /api/invoices/:id/pdf` → QR EPC069-12 în colțul din dreapta jos al facturii.
  QR conține: `BCD\n001\n1\nSCT\n{BIC}\n{tenant_name}\n{IBAN}\nEUR{amount}\n\n{invoice_number}\n`.
- [ ] AC3: Portal părinți `/portal/invoice/:id` → afișează QR + sumă + scadență.
- [ ] AC4: Dacă IBAN nu e configurat → QR nu apare (graceful degradation).
- [ ] AC5: tenant-safe; zero `any`.

## Files

### New
- `src/lib/epcQr.ts` — `generateEpcQr(iban, bic, name, amount, reference): string` (returnează data URL)
- `src/__tests__/pay/epc-qr.test.ts`
- `src/pages/portal/InvoicePortalPage.tsx`

### Modified
- `server/lib/pdfGenerator.ts` — embed QR în PDF
- `server/db/schema/index.ts` — `iban`, `bic` în tenants (sau tenant_settings)
- `src/pages/app/SettingsPage.tsx` — câmpuri IBAN + BIC

## Tests

- **T-PAY-003-1** `[blocant]` Given IBAN configurat și factură de 150 EUR, When generateEpcQr, Then QR conține "BCD", IBAN, "EUR150", invoice_number.
- **T-PAY-003-2** `[blocant]` Given IBAN gol, When GET /api/invoices/:id/pdf, Then PDF generat fără QR (fără crash).
- **T-PAY-003-3** `[blocant]` Given tenant A, When GET /portal/invoice/:id tenant B, Then 403.
- **T-PAY-003-4** [normal] UI portal: QR vizibil, sumă și scadență afișate corect.

## Definition of Done

- [ ] AC1-AC5 implementate
- [ ] T-PAY-003-1..4 trec
- [ ] Build + typecheck + lint + test verzi
- [ ] API smoke: login + GET /api/invoices/:id/pdf → 200 PDF cu QR
