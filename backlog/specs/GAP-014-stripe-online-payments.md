---
id: GAP-014
title: Plăți online cu cardul (Stripe) — link de plată per factură, auto-reconciliere
milestone: GAP
phase: "4"
branch: feat/GAP-faza-4-analytics
depends_on: [GAP-010]
---

## Goal
Directorul poate genera un link de plată Stripe pentru orice factură. Clientul deschide linkul,
plătește cu cardul, și factura e marcată automat ca plătită. Dacă Stripe nu e configurat,
butonul e dezactivat cu tooltip "Configurați Stripe în Setări".

## User stories
- Ca director, vreau să trimit un link de plată clientului, ca să primesc banii instant fără să gestionez cash.
- Ca student/parinte, vreau să plătesc online cu cardul, ca să nu trebuiască să vin fizic.
- Ca sistem, vreau ca plata să se înregistreze automat, ca să nu fie muncă manuală.

## Acceptance criteria
- [ ] API `POST /api/invoices/:id/payment-link` — creează Stripe Checkout Session, returnează URL.
- [ ] API `POST /api/stripe/webhook` — checkout.session.completed → marchează factura ca plătită + creează payment record.
- [ ] Dacă STRIPE_SECRET_KEY e nesetat, endpoint returnează 503 cu { error: "stripe_not_configured" }.
- [ ] InvoicesPage: buton "Trimite link plată" per factură nepătiță.
- [ ] Portal student (GAP-010): afișează "Plătește online" pentru soldul datorat.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/routes/stripe.ts`
- `server/app.ts`
- `src/pages/app/InvoicesPage.tsx` (adaugă buton)
- `src/pages/portal/StudentPortalPage.tsx` (adaugă buton plată)
- `src/__tests__/gap014-stripe.test.ts`

## Tests
- **T-GAP-014-1** [blocant] Given STRIPE_SECRET_KEY nesetat, When POST /api/invoices/:id/payment-link, Then 503
- **T-GAP-014-2** [blocant] Given Stripe webhook cu session completat, When POST /api/stripe/webhook, Then factura marcată paid + payment creat
- **T-GAP-014-3** [blocant] Given InvoicesPage render, Then buton "Trimite link" vizibil pe facturi neplatite
- **T-GAP-014-4** [normal] Given Stripe configurat, When POST /api/invoices/:id/payment-link, Then URL returnat cu format https://checkout.stripe.com/...

## Definition of Done
- Build verde. Teste blocante trec. (Fără migrare nouă dacă nu e nevoie schema.)
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student LOVES.
