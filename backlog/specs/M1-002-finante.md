---
id: M1-002
title: Finanțe — module page
milestone: M1
estimate_hours: 2
priority: P0
---

# M1-002 — Finanțe

## Goal
Pagina `/modules/finante` cu accent pe automatizarea încasărilor, salarii și rapoarte. Include un demo interactiv cu calculator P&L lunar și un table de plăți cu filtre.

## User stories
- **Manager**: "Cât timp pierd pe facturare manuală vs. cu Vector Learn?"
- **Contabil**: "Cum se face exportul către 1C și e-Factura?"
- **Director**: "Vreau să simulez bonuri profesori în diferite scenarii."

## Acceptance criteria
- [ ] Pagina la `/modules/finante`
- [ ] Calculator P&L: 4 inputuri (elevi activi, preț mediu, profesori, comision) → output: venit, cost, profit, margin
- [ ] Tabel demo cu 10 plăți (filtrabile: status, perioadă)
- [ ] Chart bar pentru venituri pe ultimele 7 luni (SVG inline, fără libs)
- [ ] 4 secțiuni: *Plăți online*, *Salarii automate*, *Rapoarte financiare*, *Integrări (1C, e-Factura)*
- [ ] CTA: `Cere demo financiar`
- [ ] FAQ 4 întrebări
- [ ] Responsive + dark mode + tokens semantice

## Files
**Create:**
- `src/pages/modules/FinantePage.tsx`
- `src/components/modules/finante/PLCalculator.tsx`
- `src/components/modules/finante/PaymentsTable.tsx`
- `src/components/modules/finante/RevenueChart.tsx`
- `src/__tests__/modules/finante.test.tsx`

## Tests required
- Calculator: dat input X, output Y este corect
- Tabelul filtrează corect pe status
- Chart renderizează `<rect>` count = nr. luni

## Definition of done
Quality gates trec.
