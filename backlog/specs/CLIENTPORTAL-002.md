---
id: CLIENTPORTAL-002
title: Portal client financiar — pagina client (facturi BILL, plată online CASH, sold)
milestone: FIN
phase: "22"
status: pending
depends_on: [CLIENTPORTAL-001, CASH-003]
branch: feat/FIN-clientportal
spec_version: 1
---

## Goal

Pagina publică `/portal/client` accesibilă prin magic-link token. Clientul (companie sau persoana
fizică) vede propriile facturi, statusul plăților, soldul total și poate iniția o plată online
(payment link Stripe dacă configurat, altfel link manual). Refolosește `invoices` și `payments`
existente, filtrate per `companyClientId` sau `studentId` legat de token.

## User stories

- Ca client B2B al academiei, vreau să văd lista tuturor facturilor mele cu status (plătit/neachitat),
  pentru că altfel sun la secretariat după fiecare factură.
- Ca Cristina (mama unui student), vreau să văd soldul rămas și chitanțele, pentru că pierd
  hârtiile primite fizic.
- Ca Andreea (director), vreau ca portalul clientului să afișeze un buton de plată online dacă
  factura e neachitată, pentru că reduce urmăririle manuale.
- Ca admin financiar, vreau că tokenul să fie complet izolat pe tenant, pentru că nu pot permite
  unui client să vadă facturile altui tenant.

## Acceptance criteria

1. Ruta frontend `/portal/client` (React, publică, fără sidebar app) renderizează:
   - Antetul cu `tenantName`, `contactName / companyName` din `/api/fin/client-portal/me?token=`
   - Tabel facturi: număr factură, dată emisă, scadentă, sumă, monedă, status (draft/issued/paid/cancelled)
   - Suma total datorată (facturi cu status `issued` sumate)
   - Pentru fiecare factură `issued` → buton "Plătește online" (dacă `stripeSessionId` lipsă → fallback "Contactează academia")
   - Download PDF per factură (refolosește `/api/invoices/:id/pdf` dacă există, altfel placeholder)
2. `GET /api/fin/client-portal/invoices?token=<uuid>` — public endpoint:
   - Validează token (activ, neexpirat)
   - Returnează facturile legate de `contact_id` (via `students.id` dacă token e legat de contact_id
     ce corespunde unui student) SAU `company_id` (via `companyClients.id` dacă token e B2B)
   - Câmpuri răspuns: `{invoices: [{id, invoiceNumber, amountCents, currency, status, issueDate,
     dueDate, stripeSessionId}], totalOwedCents, contactName, companyName, tenantName}`
   - Tenant-scoped: niciodată nu returnează facturi din alt tenant
3. Pagina funcționează fără cont / fără cookie de sesiune — accesul e exclusiv prin token URL param.
4. Design-system tokens (nicio culoare hardcodată), light+dark mode, WCAG AA contrast.
5. Responsiv — se poate citi pe telefon fără scroll orizontal.
6. Token invalid / expirat → pagina afișează mesaj de eroare prietenos, nu stack-trace.

## Files

### New
- `src/pages/ClientPortalPage.tsx` — pagina publică portal client
- `src/lib/api/finClientPortal.ts` — funcții API client (GET /me, GET /invoices) — extinde fișierul creat de CLIENTPORTAL-001
- `src/__tests__/fin/clientportal-002.test.tsx` — teste

### Modified
- `src/App.tsx` — adaugă ruta `/portal/client` (publică, fără PrivateRoute)
- `server/routes/finClientPortal.ts` — adaugă GET /invoices endpoint
- `server/app.ts` — (dacă nu e montat din CLIENTPORTAL-001) montează finClientPortalRoutes

## Tests

- **T-CLIENTPORTAL-002-1** [blocant] Given token valid creat pentru un student care are facturi, When GET /api/fin/client-portal/invoices?token=<valid>, Then status 200 + JSON conține array `invoices` cu cel puțin un element + câmpul `totalOwedCents` ≥ 0.
- **T-CLIENTPORTAL-002-2** [blocant] Given token invalid, When GET /api/fin/client-portal/invoices?token=bad, Then status 401 + JSON cu `error`.
- **T-CLIENTPORTAL-002-3** [blocant] Given ClientPortalPage importat, When render cu `token=demo-token` în URL, Then componentul renderizează fără crash (renders without throwing).
- **T-CLIENTPORTAL-002-4** [blocant] Given token de la tenant A, When GET /api/fin/client-portal/invoices?token=..., Then response conține NUMAI facturi cu tenantId = tenantA (nicio factură din alt tenant).
- **T-CLIENTPORTAL-002-5** [normal] Given pagina ClientPortalPage, When token lipsă din URL, Then afișează mesaj "Link invalid sau expirat" fără stack-trace.

## DoD

- [ ] Ruta `/portal/client` accesibilă fără autentificare în SPA
- [ ] GET /api/fin/client-portal/invoices returnează facturi filtrate per token + tenant
- [ ] Total datorat calculat corect (suma facturilor cu status `issued`)
- [ ] Buton "Plătește online" apare per factură issued
- [ ] Token expirat/invalid → 401 pe backend + mesaj friendly pe frontend
- [ ] Fără hex hardcodat, light+dark ok, contrast WCAG AA
- [ ] Teste T-001..5 verzi
- [ ] Build + typecheck + lint fără erori noi
