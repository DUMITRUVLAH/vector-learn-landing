# Previzualizare goală + „PDF-ul iese HTML" — a treia oară, aceeași pereche de cauze

**Categorie:** frontend / documente · **Data:** 2026-09-26 · **Găsit de:** owner, în generatorul „Cont de plată"

## Simptom
Generatorul de cont de plată (`/business/fin/invoices/document`) arăta în dreapta o foaie gri cu
„pagina tristă" a Chrome-ului în loc de previzualizare, iar „Descarcă PDF" descărca un `.html`.

## Cauzele reale (două, independente)
1. **Iframe cu sursă `blob:`.** Pagina lua HTML-ul prin `fetch`, îl punea într-un `Blob` și îl
   încadra cu `URL.createObjectURL`. CSP-ul aplicației (`frame-src 'self'`) nu permite `blob:` →
   cadrul blocat. Aceeași pană fusese reparată la vizualizatorul PAR (7901b268), dar paginile noi
   copiau tiparul vechi.
2. **PDF prin Chromium.** Ruta rasteriza HTML-ul cu Playwright; pe Vercel nu există Chromium, deci
   cădea MEREU pe rezerva HTML. Registrul de acte trecuse de mult pe pdfmake (DC-102) — generatorul
   nu.

## Repararea
- Previzualizarea = chiar PDF-ul, servit de o rută GET de pe aceeași origine
  (`/api/payment-accounts/:id/pdf`), adăugată în `FRAMEABLE_BY_US` (`server/middleware/securityHeaders.ts`).
  Ciorna se salvează automat, deci formularul are mereu un id de încadrat.
- PDF-ul se scrie cu pdfmake + fonturile Tinos/Onest (`server/lib/paymentAccounts/paymentAccountPdf.ts`),
  identic local și pe serverless.

## Gărzile care îl opresc să revină
- `src/__tests__/crm/payment-account-editor.test.tsx` — pică dacă sursa iframe-ului începe cu `blob:`
  sau nu e ruta PDF.
- `server/__tests__/securityHeaders.middleware.test.ts` — ruta PDF e încadrabilă doar de noi; orice
  altă rută a modulului rămâne `DENY`.
- `server/__tests__/payment-accounts.routes.test.ts` — răspunsul e `application/pdf` și începe cu `%PDF`.
- Zona „Conturi de plată" din `scripts/e2e-gate.mjs`.

## Regula
Un document nou: **PDF cu pdfmake pe server, niciodată Chromium; previzualizare printr-o rută GET
de pe aceeași origine trecută în `FRAMEABLE_BY_US`, niciodată `blob:`.** Vezi și
[pdf-as-picture-vs-real-pdf.md](pdf-as-picture-vs-real-pdf.md).
