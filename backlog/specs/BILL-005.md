---
id: BILL-005
title: "UI facturi B2B: listă cu filtre/status/sume, editor modal, carduri rezumat"
milestone: FIN
phase: "5"
status: pending
attempts: 0
depends_on: [BILL-004]
spec: backlog/specs/BILL-005.md
branch: feat/FIN-bill
---

## Goal

Pagina `/app/fin/invoices` (B2B FinDesk) cu:
- **Carduri rezumat** în top: total emis (MDL), total încasat, total restant, count facturi overdue
- **Tabel facturi** cu coloane: Nr., Partener, Sumă, TVA, Status (badge), Scadență, Zile restante, Acțiuni
- **Filtre**: status (toate/draft/issued/paid/overdue/cancelled), căutare text (număr/partener)
- **Modal creare factură** B2B: partener (autocomplete din `fin_parties`), linii (add/remove),
  câmp dată scadentă, valută, note. Generează la submit `POST /api/fin/invoices`.
- **Acțiuni per rând**: Emite (draft→issued), Marchează plătit (issued→paid), Anulează, Descarcă PDF
- **Badge aging**: indicator vizual în tabel dacă factura are zile restante (roșu/portocaliu/galben)

Refolosire: pattern tabel+filtru din `InvoicesPage.tsx` (B2C), carduri din `FinancePage.tsx`,
badge-uri status din design system Vector 365. Stare locală React Query — fără Zustand nou.

## User stories

- **Ca** contabil, **vreau** să văd toate facturile B2B cu filtre și status clar,
  **pentru că** gestionez 10-50 facturi active simultan.
- **Ca** director, **vreau** să văd cardurile rezumat (emis/încasat/restant) la deschiderea paginii,
  **pentru că** am nevoie de o imagine rapidă a situației financiare.
- **Ca** contabil, **vreau** să creez o factură B2B din UI cu linii, TVA, scadență,
  **pentru că** nu vreau să accesez direct API-ul.
- **Ca** contabil, **vreau** să descarc PDF-ul facturii cu un click din tabel,
  **pentru că** trimit factura imediat partenerului.

## Acceptance criteria

- [ ] `src/pages/app/FinInvoicesPage.tsx` — pagina principală, rută `/app/fin/invoices`
  - Carduri rezumat (React Query de la `/api/fin/invoices?status=...` și `/api/fin/invoices/aging`):
    - „Total emis" (suma tuturor facturilor issued+paid+overdue)
    - „Încasat" (suma facturilor paid)
    - „Restant" (suma overdue)
    - „Facturi scadente" (count overdue bucket 60+)
  - Filtre: select status + search input (text)
  - Tabel: Nr. factură, Partener (partyId → name — poate fi unknown dacă partyId null), Sumă (MDL),
    TVA (MDL), Status (badge), Scadență, Zile restante (dacă overdue), Acțiuni
  - Rând hover: highlight subtil
  - Responsive: pe mobile, ascunde coloanele TVA și Zile restante
- [ ] Badge-uri status cu token-uri design system:
  - `draft` → `bg-muted text-muted-foreground`
  - `issued` → `bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
  - `paid` → `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
  - `overdue` → `bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
  - `cancelled` → `bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400`
- [ ] `src/components/fin/FinInvoiceCreateModal.tsx` — modal creare:
  - Select partener (`fin_parties` via `/api/fin/parties`)
  - Secțiune linii: add/remove dinamic, câmpuri: descriere, cantitate, preț unitar, TVA%
  - Câmpuri factură: dată scadentă, valută (MDL/EUR/USD), note
  - Validare client-side: cel puțin o linie, vatPct required
  - Submit → POST /api/fin/invoices → invalidate query → close modal
- [ ] Buton „Descarcă PDF" → apelează `downloadFinInvoicePdf()` din `finInvoicePdf.ts`
- [ ] Acțiuni status (Emite / Marchează plătit / Anulează) → PATCH /api/fin/invoices/:id
- [ ] Ruta `/app/fin/invoices` adăugată în `src/App.tsx` (sau `src/router.tsx`)
- [ ] Link în sidebar FinDesk (sau tab în `/app/fin` dacă există layout FinDesk)
- [ ] Dark mode: zero hardcoded hex în fișiere `.tsx` — semantic tokens Vector 365
- [ ] WCAG AA: badge-uri contrast ≥ 4.5:1, butoane ≥ 44x44px, inputs cu label

## Files

**New:**
- `src/pages/app/FinInvoicesPage.tsx` — pagina principală
- `src/components/fin/FinInvoiceCreateModal.tsx` — modal creare factură
- `src/__tests__/fin/bill-005-ui.test.tsx` — teste render + interacțiuni

**Modified:**
- `src/App.tsx` (sau `src/router.tsx`) — adaugă ruta `/app/fin/invoices`
- `src/lib/api/finInvoices.ts` — adaugă funcții client API (dacă nu există deja)
- Sidebar sau layout FinDesk — link nou

## Tests

- **T-BILL-005-1** [blocant] `FinInvoicesPage` randează fără crash (render smoke test)
- **T-BILL-005-2** [blocant] Cardurile rezumat sunt prezente în DOM (4 carduri cu etichete)
- **T-BILL-005-3** [blocant] Tabelul facturi cu header coloane: Nr., Partener, Sumă, Status
- **T-BILL-005-4** [blocant] Badge status `issued` are clasa de culoare albastru
- **T-BILL-005-5** [normal] Buton „Factură nouă" deschide `FinInvoiceCreateModal`
- **T-BILL-005-6** [normal] Modal are câmpul linii cu add/remove dinamic
- **T-BILL-005-7** [normal] Dark mode: zero hardcoded hex în FinInvoicesPage.tsx și FinInvoiceCreateModal.tsx

## DoD

- Design system tokens, light+dark, WCAG AA
- Ruta `/app/fin/invoices` înregistrată în router
- check-undefined-refs verde (fără import lipsă)
- vite build verde
- Toate testele T1-T4 (blocant) verzi
- Fase BILL completă — branch feat/FIN-bill gata de PR
