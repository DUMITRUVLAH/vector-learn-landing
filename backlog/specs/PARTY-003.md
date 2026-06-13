---
id: PARTY-003
title: "UI Listă + Fișă Partener — venit cumulat, sold, aging derivate"
milestone: FIN
phase: "3"
status: in_progress
attempts: 1
depends_on: [PARTY-002, CORE-004]
spec: backlog/specs/PARTY-003.md
branch: feat/FIN-party
---

## Goal

Pagina `/app/fin/parties` (Listă parteneri) și `/app/fin/parties/:id` (Fișă partener) pentru
modulul FinDesk. Afișează lista de parteneri comerciali cu filtrare rapidă (kind/country/search)
și fișa completă cu contacte, date fiscale, și metrici derivate: **venit cumulat** (total facturi
emise pentru clientul respectiv), **sold curent** (total facturi neîncasate) și **aging** (suma
pe intervalele 0-30, 31-60, 61-90, 90+ zile) — computate din `fin_invoices` (viitor BILL-001,
stub dacă necesar). Refolosește `AppShell`, design-system tokens, light+dark mode.

## User stories

- **Ca** contabil, **vreau** să văd lista tuturor partenerilor activi filtrată pe tip (client/furnizor/ambii),
  **pentru că** am nevoie să găsesc rapid un client când emit o factură.
- **Ca** director, **vreau** să văd venitul cumulat și soldul unui partener pe fișa lui,
  **pentru că** vreau să știu cât ni se datorează total fără să export date.
- **Ca** contabil, **vreau** să văd aging-ul (0-30 / 31-60 / 61-90 / 90+ zile) pe fișa unui partener,
  **pentru că** pot prioritiza colectarea debitelor restante.
- **Ca** admin, **vreau** să adaug sau editez un partener direct din UI,
  **pentru că** nu vreau să intru în baza de date manual.

## Acceptance criteria

- [ ] Pagina `/app/fin/parties` accesibilă via `App.tsx` (route `path.startsWith('/app/fin/parties')`)
- [ ] `src/pages/app/fin/PartiesPage.tsx` — pagina de listă:
  - Tabel cu coloane: Denumire, Tip (client/furnizor/ambii), Țară, IDNO, Email, Activ/Inactiv
  - Filtre: search (debounced 300ms), kind select, isActive toggle
  - Buton „+ Partener nou" → modal de creare cu câmpurile din `createPartySchema` (PARTY-002)
  - Rând clickabil → navighează la `/app/fin/parties/:id`
  - Paginare simplă (limit 50, buton „Încarcă mai mult")
  - Empty state cu CTA când lista e goală
- [ ] Pagina `/app/fin/parties/:id` — fișa partenerului (`PartyDetailPage.tsx`):
  - Header: nume, kind badge (color: client=primary, supplier=warning, both=success), țară flag, IDNO
  - Tab **Date fiscale**: IBAN, VAT code, adresă, email, telefon, note; buton „Editează"
  - Tab **Contacte**: lista contacte (`fin_party_contacts`), buton „+ Contact nou", delete contact
  - Tab **Metrici**: carduri „Venit cumulat", „Sold curent", „Restant > 30 zile";
    aging table (0-30 / 31-60 / 61-90 / 90+ zile) cu sume în lei/valuta implicită
    — dacă tabelul `fin_invoices` nu există încă, metricile afișează 0 (stub graceful)
  - Buton „Arhivează" (soft delete, isActive=false) cu confirmare
- [ ] `src/lib/api/finParties.ts` — funcții API client:
  - `listParties(params)`, `getParty(id)`, `createParty(data)`, `updateParty(id, data)`, `deleteParty(id)`
  - `listPartyContacts(partyId)`, `createContact(partyId, data)`, `deleteContact(partyId, contactId)`
  - `getPartyMetrics(partyId)` → GET `/api/fin/parties/:id/metrics` (endpoint nou în `finParties.ts`)
- [ ] Endpoint `GET /api/fin/parties/:id/metrics` în `server/routes/finParties.ts`:
  - Returnează `{ totalRevenue: number, openBalance: number, aging: { d0_30: number, d31_60: number, d61_90: number, d90plus: number } }`
  - Dacă `fin_invoices` nu există → returnează toate câmpurile cu valoarea 0 (graceful stub)
- [ ] Design-system: doar tokens semantice (`bg-primary`, `text-muted-foreground`, etc.), dark mode funcțional
- [ ] WCAG AA: contrast ≥ 4.5:1, touch targets ≥ 44px, aria-labels pe butoanele icon-only, form labels
- [ ] TypeScript strict, zero `any`

## Files

**New:**
- `src/pages/app/fin/PartiesPage.tsx` — pagina de listă parteneri
- `src/pages/app/fin/PartyDetailPage.tsx` — fișa partenerului (tabs: date fiscale / contacte / metrici)
- `src/lib/api/finParties.ts` — API client pentru fin/parties
- `src/__tests__/fin/party-003-ui.test.tsx` — teste UI pagini

**Modified:**
- `src/App.tsx` — adaugă routes `/app/fin/parties` și `/app/fin/parties/:id`
- `server/routes/finParties.ts` — adaugă GET `/:id/metrics` endpoint

## Tests

- **T-PARTY-003-1** [blocant] `PartiesPage` se randează fără crash (render-without-crash)
- **T-PARTY-003-2** [blocant] `PartyDetailPage` se randează fără crash cu un ID valid (mock API)
- **T-PARTY-003-3** [blocant] Route `/app/fin/parties` montată în `App.tsx`
- **T-PARTY-003-4** [blocant] `GET /api/fin/parties/:id/metrics` returnează shape `{ totalRevenue, openBalance, aging }` (chiar dacă 0)
- **T-PARTY-003-5** [normal] Filtrul kind „client" filtrează lista corespunzător (mock)
- **T-PARTY-003-6** [normal] Tab „Contacte" afișează lista contacte și butonul „+ Contact nou"

## DoD

- Build + typecheck + lint verde
- check-undefined-refs verde
- check-route-mounts verde (finPartiesRoutes deja montat; niciun router nou)
- vite build verde
- Toate testele T1-T6 verzi
- Metrici graceful stub când `fin_invoices` lipsesc (0, nu 500)
