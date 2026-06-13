---
id: BILL-004
title: "PDF factură B2B: html2canvas, multi-limbă ro/ru/en, semnătură + download"
milestone: FIN
phase: "5"
status: pending
attempts: 0
depends_on: [BILL-003]
spec: backlog/specs/BILL-004.md
branch: feat/FIN-bill
---

## Goal

Generator PDF pentru facturile B2B (`fin_invoices`) cu suport multi-limbă (ro/ru/en),
câmpuri pentru semnătură și ștampilă, și buton de download client-side.

Tehnica: aceeași ca `src/lib/parPdf.ts` și `src/lib/paymentAccountPdf.ts` — `buildFinInvoiceHtml()`
generează HTML-ul, `downloadFinInvoicePdf()` rasterizează cu html2canvas+jsPDF. Nu se adaugă
dependențe noi — jspdf și html2canvas sunt deja în package.json.

Endpoint server: `GET /api/fin/invoices/:id/pdf` returnează `{ data: { html, invoiceNumber } }`
(printabil via `window.print()` sau descărcabil client-side). Frontend `finInvoicePdf.ts` oferă
și download direct browser.

## User stories

- **Ca** contabil, **vreau** să descarc factura B2B ca PDF cu toate datele (linii, TVA, totaluri),
  **pentru că** trimit factura fizică sau electronică partenerului.
- **Ca** director, **vreau** ca factura să apară în limba partenerului (ro/ru/en),
  **pentru că** unii parteneri preferă ru sau en.
- **Ca** contabil, **vreau** ca PDF-ul să aibă spațiu pentru semnătură și ștampilă,
  **pentru că** facturile necesită semnătură autorizată conform legislației MD.
- **Ca** sistem, **vreau** ca generatorul să fie pur (fără side-effects), testabil în Vitest,
  **pentru că** nu vreau teste care necesită un browser real.

## Acceptance criteria

- [ ] `src/lib/finInvoicePdf.ts` exportă:
  - `buildFinInvoiceHtml(invoice, lines, options): string` — HTML complet al facturii, pur, testabil
    - `options.lang`: `"ro" | "ru" | "en"` (default `"ro"`)
    - Conține: antet (series/number, date), date emitent (din tenant), date destinatar (partyName),
      tabel linii (descriere, cantitate, preț unitar, TVA%, total linie), totaluri (subtotal fără TVA,
      TVA, total cu TVA), câmp semnătură+ștampilă (2 coloane: emitent / destinatar)
    - Etichete traduse: "Factură"/"Счёт-фактура"/"Invoice", "Nr."/"No.", "Data"/"Дата"/"Date",
      "Descriere"/"Описание"/"Description", "Cant."/"Кол."/"Qty", "Preț unitar"/"Цена"/"Unit Price",
      "TVA %"/"НДС %"/"VAT %", "Total"/"Итого"/"Total", "Semnătură"/"Подпись"/"Signature"
    - Inline hex OK (ca în parPdf.ts — pdf-only, nu design-system tokens)
  - `downloadFinInvoicePdf(invoice, lines, options): Promise<void>` — html2canvas → jsPDF → download
- [ ] `GET /api/fin/invoices/:id/pdf` adăugat la `finInvoicesRoutes`:
  - Returnează 200 cu `{ data: { html: string, invoiceNumber: string } }` sau 404
  - Nu generează PDF server-side — generarea rămâne client-side; endpoint returnează HTML
  - Acceptă query param `?lang=ro|ru|en` (default ro)
- [ ] Tenant isolation: endpoint verifică `tenantId`

## Files

**New:**
- `src/lib/finInvoicePdf.ts` — generator HTML + download client-side
- `src/__tests__/fin/bill-004-pdf.test.ts` — teste pe buildFinInvoiceHtml (pure function)

**Modified:**
- `server/routes/finInvoices.ts` — adaugă GET `/:id/pdf`

## Tests

- **T-BILL-004-1** [blocant] `buildFinInvoiceHtml()` returnează string ce conține `invoiceNumber` și `totalCents` formatatate
- **T-BILL-004-2** [blocant] Cu `lang="ru"` — HTML conține "Счёт-фактура" (nu "Factură")
- **T-BILL-004-3** [blocant] Cu `lang="en"` — HTML conține "Invoice" și "Signature"
- **T-BILL-004-4** [blocant] GET `/api/fin/invoices/:id/pdf` returnează 200 cu câmpul `html` ne-gol
- **T-BILL-004-5** [blocant] GET `/api/fin/invoices/unknown-id/pdf` returnează 404
- **T-BILL-004-6** [normal] HTML generat conține tabelul de linii (cel puțin o `<tr>` per linie)
- **T-BILL-004-7** [normal] HTML conține secțiunea de semnătură (`Semnătură` sau `Подпись` sau `Signature`)

## DoD

- `buildFinInvoiceHtml` este o funcție pură (no DOM, no browser — testabilă în Vitest/Node)
- Nu se adaugă dependențe noi (jspdf + html2canvas deja în project)
- TypeScript strict, zero any
- check-undefined-refs verde
- Toate testele T1-T5 (blocant) verzi
