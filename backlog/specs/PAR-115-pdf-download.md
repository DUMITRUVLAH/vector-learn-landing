---
id: PAR-115
title: "Buton Download PDF pe /app/par/:id + atașează PDF-ul la înregistrare"
milestone: PAR
phase: "E"
status: pending
attempts: 0
depends_on: [PAR-114]
spec: backlog/specs/PAR-115-pdf-download.md
core: backlog/par/PAR-CORE.md
---

## Goal

Integrează generatorul PDF (PAR-114) în UI: un buton „Download PDF" pe pagina de detaliu care descarcă
formularul cu un click, și opțional atașează PDF-ul generat la înregistrare (`par_attachments` kind=`par_pdf`),
ca să existe o copie arhivată.

## User stories

- **Ca** requestor, **vreau** un buton de descărcare a PDF-ului, **pentru că** îl trimit mai departe.
- **Ca** organizație, **vreau** ca PDF-ul aprobat să fie atașat la cerere, **pentru că** vreau o copie oficială arhivată.

## Acceptance criteria

- [ ] Buton „Download PDF" pe `/app/par/:id` → apelează `downloadParPdf(par)` (PAR-114); funcționează fără crash
- [ ] Loading state pe buton în timpul generării
- [ ] „Save copy to attachments" — după un download reușit, oferă (sau execută automat) atașarea PDF-ului generat la `par_attachments` cu `kind=par_pdf`; CORE §5 specifică că PDF-ul generat trebuie atașat la înregistrare (nu opțional)
- [ ] Disponibil pentru rolurile care văd PAR-ul; Vector 365, a11y (aria-label), light+dark
- [ ] Smoke test: click → fără eroare (mock jsPDF în test)

## Files

**Modified:**
- `src/pages/par/ParDetail.tsx` (sau pagina detaliu existentă) — buton + handler
- `src/lib/api/par.ts` — `attachGeneratedPdf` (dacă se salvează copie)

**New:**
- test în `src/pages/par/__tests__/ParDetail.pdf.test.tsx`

## Tests

- **T-PAR-115-1** [blocant] Given `/app/par/:id`, When click „Download PDF", Then se generează A4 fără eroare
- **T-PAR-115-2** [normal] Given PDF generat, Then se atașează la înregistrare (kind=par_pdf)

## DoD

- Build verde · reviewer APPROVED · personas salvate
