# PAR-114 Integration Report

**Item:** PAR-114 — Generator PDF parPdf.ts
**Date:** 2026-06-12

## Verdict: CONNECTED

## Integration checks

1. **Type compatibility** — `buildParHtml(par: ParDetail)` takes the same `ParDetail` type that `getPar()` returns. The `ParPayment` type was extended to include `receivedByUserId` and `assignedToUserId` fields that section 16 needs (they were already in `ParPaymentRecord` used by the finance queue).

2. **No new dependencies** — uses `jspdf` and `html2canvas` which are already in `package.json`. `import { jsPDF } from "jspdf"` and `import html2canvas from "html2canvas"` are same pattern as `paymentAccountPdf.ts`.

3. **Export completeness** — `buildParHtml`, `downloadParPdf`, `money`, `esc` are all exported. The test can import and test them directly without a browser.

4. **Data flow** — `ParDetail.line_items`, `ParDetail.approvals`, `ParDetail.payment` — all populated by `getPar()` API. The PDF correctly uses all three.

5. **No schema changes** — this is a pure frontend generation feature. No new database tables or migrations needed.

6. **Attachment integration** — PAR-115 calls `uploadAttachment(parId, { kind: "par_pdf" })` after generating the PDF, connecting to the `par_attachments` table. The `ParAttachmentKind = "par_pdf"` type is already defined in `par.ts`.

## Conclusion: CONNECTED — PDF generator integrates cleanly with existing PAR data model.
