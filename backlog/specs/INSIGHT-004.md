---
id: INSIGHT-004
title: "UI dashboard FinDesk Insights — /app/finance/insights (carduri KPI, charts, vederi salvate)"
milestone: FIN
phase: "13"
status: pending
depends_on: [INSIGHT-003]
spec: backlog/specs/INSIGHT-004.md
branch: feat/FIN-insight
---

## Goal

Implementează pagina UI FinDesk Insights (FIN-CORE §1.13) la `/app/finance/insights`:

1. **Carduri KPI** — Revenue, Receivable, Profit, Aging Total (valori din `/api/analytics/fin/metrics`
   și `/api/analytics/fin/aging`), cu delta față de luna precedentă (%).
2. **Chart venituri/cheltuieli** — line chart lunar (ultimele 6 luni) din `/api/analytics/fin/metrics`.
   Refolosire `recharts` (deja folosit în REP-302).
3. **Chart cashflow forecast** — 3 linii (Bun/Bază/Slab) pe 60 de zile din
   `/api/analytics/fin/cashflow-forecast`. Toggle compact vs full (30z vs 60z).
4. **Top clienți/furnizori** — tabel simplu cu top 5 surse de venit pe luna curentă
   (din metrics cu groupBy=category).
5. **Vederi salvate** — dropdown cu vederi salvate ale utilizatorului (`listSavedViews()`),
   un buton „+ Salvează vedere curentă" care deschide un modal simplu (name + metric + period).
6. **Narativă AI** — secțiune „Narativă luna curentă": dacă există narativă publicată → afișează textul;
   dacă nu → buton „Generează narativă AI" (`generateAiNarrative()`), cu spinner și text draft
   (badge „Draft — nepublicat") după generare.
7. Refolosire: API client `src/lib/api/finInsight.ts` (INSIGHT-002+003). Tokens Vector 365.
   Light + dark mode. WCAG AA. Zero hex hardcodat.

---

## User stories

- Ca **director financiar**, vreau să văd pe o singură pagină: KPI-urile lunii + forecast + narativă AI,
  pentru că evit să deschid 5 rapoarte separate și să încarc datele manual.
- Ca **director**, vreau să salvez combinația de filtre ca „vedere" (ex. „Cheltuieli IT Q4"),
  pentru că o folosesc lunar și nu vreau să o reconfigurez de fiecare dată.
- Ca **director**, vreau să generez narativa AI cu un click și să o văd în format draft,
  pentru că o editez eu manual înainte de a o trimite la board.

---

## Acceptance criteria

- [ ] AC1: Ruta `/app/finance/insights` există și randează fără crash (route în `App.tsx`).
- [ ] AC2: 4 carduri KPI: Revenue / Receivable / Profit / Aging Total — valori în MDL (cenți → MDL cu 2 zecimale), delta % față de luna precedentă cu săgeată ↑↓, skeleton loading.
- [ ] AC3: Chart venituri/receivable (line chart, ultimele 6 luni). Refolosire `recharts`. Tooltip cu valorile. Responsive.
- [ ] AC4: Chart cashflow forecast 60z — 3 linii colorate (Bun=verde/emerald, Bază=albastru/blue, Slab=roșu/red). Toggle „30 zile / 60 zile".
- [ ] AC5: Tabel „Top surse venit" — 5 rânduri (name, sumă MDL, procent din revenue total). Empty state dacă nu sunt date.
- [ ] AC6: Dropdown „Vederi salvate" cu vederi ale utilizatorului + publice. Buton „+ Salvează vederea curentă" → modal cu câmpuri: Nume, Metrică (select), Perioadă (select). Submit apelează `createSavedView()`.
- [ ] AC7: Secțiune „Narativă luna curentă":
  - Dacă narativă publicată există: afișează titlu + text markdown + badge sentiment (color-coded: positive=green, neutral=gray, negative=red).
  - Dacă nu există sau e draft: buton „Generează narativă AI" → spinner → afișare text draft cu badge „Draft".
  - Eroare (409 = narativă manuală) → toast cu mesajul din server.
- [ ] AC8: Design system tokens (no hex). Dark mode. Responsive mobile (stiva carduri vertical). WCAG AA (contrast, aria-labels).
- [ ] AC9: Link în sidebar `/app/finance/insights` (sau tab pe pagina `/app/finance` existentă dacă există nav).

---

## Files to create / modify

**Create:**
- `src/pages/finance/FinInsightsPage.tsx` — pagina principală
- `src/components/fin/KpiCard.tsx` — card KPI cu delta
- `src/components/fin/CashflowChart.tsx` — chart forecast 3 scenarii
- `src/components/fin/SaveViewModal.tsx` — modal creare vedere salvată
- `src/__tests__/fin/fin-insights-page.test.tsx` — render-without-crash + interacțiuni

**Modify:**
- `src/App.tsx` — adaugă ruta `/app/finance/insights` → `FinInsightsPage`
- `src/components/layout/Sidebar.tsx` (sau echivalentul) — adaugă link „Insights" sub Finance

---

## Tests

- **T-INSIGHT-004-1** `[blocant]` Given `FinInsightsPage` cu toate fetch-urile mock-uite (metrics, aging, cashflow, saved-views, narratives),
  When `render(<FinInsightsPage />)`, Then nu aruncă excepție și conține text „Revenue" sau „Venituri".
- **T-INSIGHT-004-2** `[blocant]` Given `KpiCard` cu props `{ label: "Revenue", valueCents: 150000, deltaPct: 12.5 }`,
  When render, Then conține „1.500,00 MDL" (sau „1.500,00") și „12,5%" și o săgeată ↑.
- **T-INSIGHT-004-3** [normal] Given butonul „Generează narativă AI" vizibil (fără narativă publicată),
  When click, Then se apelează `generateAiNarrative` (verificat cu spy/mock) și apare un element cu textul „Draft".
- **T-INSIGHT-004-4** [normal] Given butonul „+ Salvează vederea curentă",
  When click, Then apare un dialog/modal cu un input pentru „Nume".
- **T-INSIGHT-004-5** [normal] Given `CashflowChart` cu props `{ scenarios: { good: [...], base: [...], pessimistic: [...] } }`,
  When render, Then nu aruncă excepție și există un element `<svg>` în DOM.

---

## Definition of Done

- [ ] AC1-AC9 implementate
- [ ] T-INSIGHT-004-1..2 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] Light + dark mode funcțional (tokens Vector 365, zero hex)
- [ ] WCAG AA: 0 violări critical+serious (axe)
- [ ] Ruta în App.tsx adăugată
- [ ] Fase INSIGHT (13) completă — PR feat/FIN-insight deschis cu toate 4 item-uri (INSIGHT-001..004)
