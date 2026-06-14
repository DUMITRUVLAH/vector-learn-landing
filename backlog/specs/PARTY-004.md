---
id: PARTY-004
title: "CRM Financiar parteneri: segmentare, top clienți după venit, aging per partener"
milestone: FIN
phase: "3"
status: pending
attempts: 0
depends_on: [PARTY-003, BILL-001]
spec: backlog/specs/PARTY-004.md
branch: feat/FIN-party
---

## Goal

Extinde modulul parteneri cu **analytics financiare reale** bazate pe `fin_invoices` (livrat în BILL-001):
segmentare automată (VIP/Regular/New), clasament top-N clienți după venit cumulat, aging per partener.
Nu există migrare nouă — datele sunt computate la query din tabele existente.

BILL-001 e acum pe branch-ul feat/FIN-bill și merged în main (sau aproape). PARTY-004 adaugă endpoint-urile
analytics pe aceeași ramură feat/FIN-party.

## User stories

- **Ca** director financiar, **vreau** să văd topul primilor 10 clienți după venit,
  **pentru că** alocarea resurselor de account management se face pe clienți mari.
- **Ca** contabil, **vreau** să văd segmentul fiecărui partener (VIP/Regular/New),
  **pentru că** prioritizez urmărirea creanțelor în funcție de valoarea partenerului.
- **Ca** contabil, **vreau** să văd aging-ul detaliat per partener (0-30 / 31-60 / 61-90 / 90+),
  **pentru că** trimit remindere diferențiate în funcție de vechimea creanței.
- **Ca** director, **vreau** un dashboard sumar per partener (venit, sold deschis, segement),
  **pentru că** vreau să știu dintr-o privire starea relației comerciale cu fiecare partener.

## Acceptance criteria

### Backend — noi endpoint-uri pe `finPartiesRoutes`

- [ ] `GET /api/fin/parties/analytics/top-clients?limit=10&currency=MDL`
  - Returnează top-N parteneri de tip `client|both` sortat DESC după venit cumulat din
    `fin_invoices` cu `status = 'paid'`
  - Fiecare element: `{ partyId, partyName, totalRevenueCents, openBalanceCents, segment }`
  - Dacă fin_invoices nu e accesibil → returnează `[]` (graceful)
  - Param `limit`: 1–50, default 10

- [ ] `GET /api/fin/parties/analytics/segments?currency=MDL`
  - Returnează distribuția segmentelor: `{ VIP: N, Regular: N, New: N }`
  - Logica segmentare (per tenant, bazat pe venit cumulat din fin_invoices paid):
    - **VIP**: venit cumulat > 50.000 MDL (sau > 0 dacă nicio factură — adresa de top 10%)
    - **Regular**: are cel puțin o factură (paid/issued)
    - **New**: nicio factură înregistrată

- [ ] `GET /api/fin/parties/:id/aging` (ÎNLOCUIEȘTE stub-ul din `/metrics`)
  - Returnează aging detaliat real: `{ d0_30, d31_60, d61_90, d90plus }` (sume în cents)
  - Bazat pe `fin_invoices` unde `status IN ('issued','overdue')` și `dueDate < now()`
  - Dacă partyId nu există sau nu aparține tenantului → 404
  - Returnează zerouri dacă nicio creanță scadentă

- [ ] Segmentul (`segment: "VIP" | "Regular" | "New"`) apare și în răspunsul `GET /api/fin/parties/:id`
  (câmp calculat, nu stocată în DB)

### Frontend — UI analytics în pagina Parteneri

- [ ] Tab sau secțiune "Top Clienți" în `/app/fin/parties` (sau sidebar/drawer)
  - Tabel cu coloane: Partener | Venit cumulat | Sold deschis | Segment
  - Badge colorat per segment: VIP = bg-primary, Regular = bg-secondary, New = bg-muted
  - Tokeni design system — zero hex hardcodate
  - Dark mode funcțional

- [ ] Widget aging per partener în fișa partenerului `/app/fin/parties/:id`
  - 4 buckets vizualizate ca bare sau numere colorate
  - D0-30 (verde), D31-60 (galben), D61-90 (portocaliu), D90+ (roșu) — folosind tokeni semantici
    (nu hex): `text-success`, `text-warning`, `text-destructive`

- [ ] Segmentul apare în card/badge în lista de parteneri și în fișa partenerului

### Calitate

- [ ] TypeScript strict — zero `any` nou
- [ ] WCAG AA: contrast ≥ 4.5:1 pe toate badge-urile
- [ ] Lighthouse perf ≥ 90 pe ruta `/app/fin/parties`
- [ ] Axe: 0 violări critical+serious
- [ ] Test de smoke: render fără crash + top-clients API returnează array

## Files to create / modify

- `server/routes/finParties.ts` — adaugă 3 endpoint-uri analytics + câmpul `segment` în GET /:id
- `src/pages/app/fin/PartiesPage.tsx` (sau `PartyDetailPage.tsx`) — UI top clienți + aging
- `src/__tests__/fin/parties-analytics.test.tsx` — smoke tests

## Tests

- **T-PARTY004-1** [blocant] Given API `/api/fin/parties/analytics/top-clients` called with valid auth, When fin_invoices has data, Then returns array sorted DESC by totalRevenueCents
- **T-PARTY004-2** [blocant] Given fin_invoices table inaccessible, When top-clients called, Then returns `[]` (graceful fallback, not 500)
- **T-PARTY004-3** [normal] Given party with open invoices, When `/api/fin/parties/:id/aging` called, Then returns correct d0_30/d31_60/d61_90/d90plus buckets
- **T-PARTY004-4** [normal] Given a partner with >50k MDL paid, When segments endpoint called, Then that partner appears in VIP count
- **T-PARTY004-5** [blocant] Given PartiesPage renders, When analytics tab viewed, Then no crash and segment badges visible
- **T-PARTY004-6** [normal] Given dark mode active, When PartiesPage loaded, Then badges use semantic tokens (no hex in className)

## DoD

- Build + typecheck + lint verzi
- Smoke test (render + API) verde
- Reviewer APPROVED
- integration-architect CONNECTED (reuse fin_invoices, nu tabel nou)
- Persona reports salvate
- PR pe feat/FIN-party (aceeași ramură ca PARTY-001/002/003)
