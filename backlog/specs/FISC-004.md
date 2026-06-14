---
id: FISC-004
title: "Dashboard fiscal — calendar termene, alertă scadențe, istoric declarații"
milestone: FIN
phase: "10"
status: pending
depends_on: [FISC-003, CORE-004]
spec: backlog/specs/FISC-004.md
branch: feat/FIN-fisc
---

## Goal

Pagina principală `/app/fin/tax/dashboard` care centralizează:
- Calendar termene legale de depunere (25 ale lunii pentru TVA12-MD, 25 ale lunii pentru D394-RO)
- Alerte pentru declarații nefiled cu termen depășit sau în 7 zile
- Istoric declarații cu status, dată depunere, export retroactiv

Niciun calcul fiscal — doar vizualizare și tracking al statusului. Integrare cu CORE-004
(notification system) pentru push-uri la 7 zile înainte de termen.

---

## User stories

- Ca **contabil**, vreau să văd un calendar cu termenele de depunere ale lunii curente și ale lunilor trecute, pentru că nu pot ține în cap toate scadențele fiscale.
- Ca **director**, vreau să primesc o alertă cu 7 zile înainte de termenul de depunere, pentru că o declarație nedepusă la timp atrage penalități.
- Ca **contabil**, vreau să văd istoricul tuturor declarațiilor depuse (data, tip, număr înregistrare), pentru că am nevoie de dovada conformității la control fiscal.
- Ca **administrator**, vreau să configurez dacă suntem MD sau RO (sau ambele), pentru că termenele și tipurile de declarații diferă.

---

## Acceptance criteria

- [ ] `GET /api/fin/tax/dashboard` returnează: `{upcoming_deadlines: [{date, declaration_type, period_id, days_until}], overdue: [{...}], recent_filings: [{...}]}`
- [ ] Termene calculate determinist: TVA12-MD = ziua 25 a lunii următoare perioadei; D394-RO = ziua 25 a lunii următoare; D301-RO = 45 zile după perioada
- [ ] Alertă: dacă `days_until <= 7` → declarație în `upcoming_alerts` (înroșit în UI)
- [ ] Alertă: dacă termen trecut și status ≠ 'filed' → declarație în `overdue_alerts`
- [ ] Pagina `/app/fin/tax/dashboard` afișează: calendar lunar, lista „De depus în curând" (badge roșu/galben), lista „Depuse" cu buton download retroactiv
- [ ] Integrat cu notification system (CORE-004): la `days_until == 7`, se creează o in-app notification per tenant
- [ ] `GET /api/fin/tax/declarations` returnează lista completă cu filtre `?status=filed&year=2025`
- [ ] Design-system tokens, light+dark, WCAG AA
- [ ] Tenant isolation

---

## Files to create / modify

**Create:**
- `server/lib/fin/taxDeadlines.ts` — calcul termene legale per tip declarație
- `src/pages/fin/TaxDashboardPage.tsx` — dashboard `/app/fin/tax/dashboard`

**Modify:**
- `server/routes/finTax.ts` — adaugă `/dashboard` și `/declarations` cu filtre
- `src/App.tsx` — adaugă ruta `/app/fin/tax/dashboard`

---

## Tests

- **T-FISC-004-1** [blocant] Given server pornit, When `GET /api/fin/tax/dashboard`, Then 200 cu câmpurile `upcoming_deadlines`, `overdue`, `recent_filings`
- **T-FISC-004-2** [blocant] Given perioadă TVA12-MD pentru luna 2025-01, When calcul termen, Then deadline = 2025-02-25
- **T-FISC-004-3** [blocant] Given pagina `/app/fin/tax/dashboard`, When render, Then nu crash
- **T-FISC-004-4** [normal] Given declarație nefiled cu termen trecut, When GET /dashboard, Then apare în câmpul `overdue`
- **T-FISC-004-5** [normal] Given `days_until = 5`, When render UI, Then badge roșu vizibil (nu hex hardcodat)
- **T-FISC-004-6** [normal] Given dark mode, When pagina dashboard, Then zero culori hex hardcodate

---

## Definition of Done

- Dashboard cu calendar termene și alerte
- Integrare CORE-004 notifications
- T-FISC-004-1..3 verde (blocante)
- Design-system tokens, WCAG AA
