# PAR-115 Persona Manager Report

**Item:** PAR-115 — Buton Download PDF pe /app/par/:id + atașează PDF-ul la înregistrare
**Persona:** Andreea Mitran, academy director
**Date:** 2026-06-12

## Verdict: BUY

## Review

The Download PDF button is exactly where I need it — on the PAR detail page, visible right next to the PAR number and status. One click, it downloads the complete form as an A4 PDF.

**What works well:**

1. **Loading state** — the button says "Se generează PDF..." while generating. I know it's working. No confusion.

2. **Success state** — turns green with a checkmark for 3 seconds then resets. Clear feedback.

3. **Auto-attachment (CORE §5)** — the PDF is automatically saved to the PAR record under "Atașamente" with the label "(PDF generat)". This is the archive copy the owner wanted. I don't have to upload it separately.

4. **PAR detail page** — the new `/app/par/:id` page shows all 16 sections in a clean, readable layout. I can review a PAR without opening the wizard.

5. **Navigation** — the dashboard already had `onRowClick → /app/par/:id` so clicking a PAR row goes to the detail page immediately.

**Minor concerns:**
- The `requestedByUserId` shows raw user UUIDs instead of display names. This is a data-layer limitation; the API would need to join users. Not blocking for v1.
- If the PDF generation fails (network timeout, canvas rendering issue), the error message appears below the button. Acceptable.

**Bottom line:** One-click PDF download that automatically archives to the record. This is the workflow the owner described. BUY.
