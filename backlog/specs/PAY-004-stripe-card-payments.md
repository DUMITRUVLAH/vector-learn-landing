---
id: PAY-004
title: "Plată cu cardul prin Stripe — Payment Link per factură + webhook reconciliere"
milestone: PAY
phase: "3"
status: pending
depends_on: [PAY-001, PAY-003]
slug: stripe-card-payments
---

## Goal

Integrează Stripe pentru a permite părinților să plătească cu cardul direct dintr-un link trimis pe email/WhatsApp.
Fiecare factură nepaid primește un Payment Link Stripe generat la cerere. La plată reușită, webhook-ul marchează
factura ca paid și trimite chitanță. Configurația (Stripe publishable key, secret key, webhook secret) se face
din Settings → Integrări.

## User stories

- **US-1**: Ca Părinte, vreau să primesc un link de plată pe email și să plătesc cu cardul în 2 click-uri, pentru că nu vreau să mai vin fizic la centru.
- **US-2**: Ca Recepționer, vreau să văd factura marcată automat ca paid după plata cardului, pentru că nu vreau să reconciliez manual.
- **US-3**: Ca Manager, vreau să configurez cheile Stripe din Settings, pentru că fiecare centru are propriul cont Stripe.
- **US-4**: Ca Director, vreau să văd în lista de plăți care au fost plătite prin card vs cash, pentru că raportul de cashflow trebuie să distingă metodele.

## Acceptance criteria

- [ ] AC1: `POST /api/invoices/:id/stripe-link` → creează Stripe Payment Link (sau Stripe Checkout Session) pentru factura respectivă; returnează `{url, expiresAt}`. Returnează 400 dacă factura e deja paid sau dacă Stripe nu e configurat.
- [ ] AC2: `POST /api/webhooks/stripe` → procesează `payment_intent.succeeded`: marchează payment status `paid`, setează `payment_method: "card"`, `paid_at: now()`, `stripe_payment_intent_id` salvat pe invoice. Idempotent (retry safe).
- [ ] AC3: `POST /api/webhooks/stripe` → procesează `payment_intent.payment_failed`: logează eroarea în `invoice_events` (tip `stripe_failed`), nu schimbă status.
- [ ] AC4: UI — pe card-ul facturii nepaid: buton "Trimite link plată" (deschide modal cu preview link + buton "Copiază" + buton "Trimite pe email"). Buton dezactivat dacă Stripe nu e configurat.
- [ ] AC5: Settings → Integrări → secțiunea Stripe: câmpuri `publishable_key`, `secret_key`, `webhook_secret` (masked), buton Save + buton Test Connection (face un list charges cu 0 items → success).
- [ ] AC6: `payment_method` afișat ca badge în lista de plăți: "Card" (albastru), "Cash" (verde), "Transfer" (gri).
- [ ] AC7: Tenant isolation — Stripe keys sunt stocate per-tenant în `tenant_settings`, nu în .env global.

## Files to create / modify

- `server/db/schema/stripeSettings.ts` — tabel `stripe_settings` (tenant_id, publishable_key, secret_key_encrypted, webhook_secret_encrypted)
- `server/routes/stripe.ts` — route `/api/invoices/:id/stripe-link` + `/api/webhooks/stripe`
- `server/routes/settings.ts` — extend cu CRUD stripe settings
- `server/lib/stripe.ts` — helper: init Stripe client per tenant, encrypt/decrypt keys (AES-256 sau base64 ca stub)
- `src/pages/PaymentsPage.tsx` — add "Trimite link plată" button pe invoice card
- `src/components/payments/StripeLinkModal.tsx` — modal cu URL + copy + send email
- `src/pages/settings/IntegrationsPage.tsx` — Stripe settings form (sau extend Settings existent)
- `drizzle/0032_pay004_stripe_settings.sql` — migrare nouă

## Tests

- **T-PAY-004-1** [blocant] Given o factură cu status pending și Stripe configurat, When POST /api/invoices/:id/stripe-link, Then răspuns 200 cu `url` care începe cu `https://` și `expiresAt` în viitor.
- **T-PAY-004-2** [blocant] Given webhook event `payment_intent.succeeded` valid (signature OK), When POST /api/webhooks/stripe, Then factura devine paid, `stripe_payment_intent_id` salvat, răspuns 200.
- **T-PAY-004-3** [blocant] Given API smoke — boot server, POST /api/auth/login → 200, POST /api/invoices/:id/stripe-link → 200 sau 400-no-stripe-configured (nu 500).
- **T-PAY-004-4** [normal] Given Stripe nu e configurat pentru tenant, When POST /api/invoices/:id/stripe-link, Then 400 cu `error: "stripe_not_configured"`.
- **T-PAY-004-5** [normal] Given o factură deja paid, When POST /api/invoices/:id/stripe-link, Then 400 cu `error: "invoice_already_paid"`.
- **T-PAY-004-6** [normal] Given webhook cu signature invalidă, When POST /api/webhooks/stripe, Then 400 fără a modifica baza de date.

## Definition of Done

- [ ] Migrare SQL commitată și `db:reset && db:seed` trec
- [ ] `npm run typecheck` fără erori
- [ ] Toate testele T-PAY-004-* trec
- [ ] Buton "Trimite link plată" vizibil pe factură nepaid, dezactivat fără Stripe
- [ ] Settings Stripe form funcțional cu mascare chei
- [ ] Reviewer APPROVED, integration-architect CONNECTED
- [ ] Persona manager BUY sau MAYBE
