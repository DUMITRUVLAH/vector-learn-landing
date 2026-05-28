---
id: F-FIN-RECURRING-001
title: Abonament recurent (Stripe + alți procesatori)
module: finante
status: specced
priority: P0
owner: backend-team
landing_demo: M1-002
---

# Goal

Permite centrelor să încaseze abonamente lunare/trimestriale/anuale automat de la cardul părintelui, cu retry logic la failure, notificare smart înainte de încasare, și opțiune de pause/cancel din portalul părintelui.

# Personas

- **Manager**: configurează planurile (preț, ciclu, reduceri)
- **Părinte/Plătitor**: salvează cardul la prima plată, primește notificări, poate pause/cancel
- **Sistem-auto**: încasează la data scadentă, gestionează failures, generează facturi e-Factura

# Scenarii

## Scenariul 1 — Prima înregistrare (card on file)

- **Trigger**: Părinte plătește prima factură via Stripe Checkout
- **Pași**:
  1. Stripe Checkout cu `setup_future_usage = 'off_session'`
  2. Webhook `payment_intent.succeeded` → marcăm `customer.has_payment_method = true`
  3. Creează `subscription` cu `status = active`, `next_billing = today + cycle`
  4. Trimite email confirmare cu link "Anulează oricând din contul tău"

## Scenariul 2 — Încasare automată recurentă

- **Trigger**: cron zilnic 09:00 GMT+3 caută subscriptions cu `next_billing = today`
- **Pași**:
  1. Trimite reminder cu 3 zile înainte: "Abonamentul tău se reînnoiește cu 280€ pe 30 mai"
  2. La data scadentă, creează `PaymentIntent` cu `off_session = true, confirm = true`
  3. Dacă succes: marchează factura ca paid, generează e-Factura ANAF în background, trimite chitanță PDF
  4. Dacă fail (insufficient_funds, expired_card, do_not_honor): vezi Scenariul 3

## Scenariul 3 — Plată eșuată, retry smart

- **Trigger**: webhook `payment_intent.payment_failed`
- **Pași**:
  1. Notificare instant părinte: "Cardul tău a fost respins. Verifică sau actualizează"
  2. Retry automat la zi+3, zi+5, zi+7 (Stripe Smart Retries dacă activ, altfel manual)
  3. La fiecare retry, notificare nouă
  4. După 3 retry eșuate (zi+7), suspendă `subscription.status = 'past_due'` + notificare către manager
  5. Suspendă accesul la lecții online (configurabil per centru, implicit DA)
  6. Părinte poate plăti restant cu un click → reactivare imediată

## Scenariul 4 — Pause de către părinte

- **Trigger**: părinte apasă "Pauză 1 lună" din portal (ex: vacanță vară)
- **Pași**:
  1. UI cere motivul (analytics)
  2. `subscription.paused_until = today + 30days`
  3. Nicio încasare în perioada respectivă
  4. Re-notificare cu 7 zile înainte de reluare
  5. Manager primește notificare (pentru a planifica orarul fără elevul respectiv)

## Scenariul 5 — Cancel definitiv

- **Trigger**: părinte apasă "Anulează abonamentul"
- **Pași**:
  1. Confirmare cu motiv (radio: prea scump, copilul nu mai vrea, am găsit alt centru, alt motiv)
  2. Subscription rămâne activă până la finalul ciclului plătit
  3. Notificare manager + ofertă opțional de retenție (ex: -20% lunile următoare)
  4. La finalul ciclului, `subscription.status = 'canceled'`
  5. Email "Ne pare rău că pleci, contul rămâne ca să poți reveni oricând"

## Scenariul 6 — Schimbarea cardului

- Părinte deschide portal → click "Update card" → Stripe SetupIntent → webhook → noua metodă de plată devine default → retentry imediat pe orice plată restantă

# Data model

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id),
  customer_id TEXT NOT NULL, -- stripe_customer_id
  plan_id UUID REFERENCES pricing_plans(id),
  status ENUM('active','past_due','paused','canceled','incomplete'),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  cancel_reason TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY,
  subscription_id UUID REFERENCES subscriptions(id),
  invoice_id UUID REFERENCES invoices(id),
  stripe_payment_intent TEXT,
  amount_cents INT,
  currency CHAR(3),
  status ENUM('succeeded','failed','pending'),
  failure_code TEXT NULL,
  attempted_at TIMESTAMPTZ DEFAULT now()
);
```

# API surface

```
POST /api/v1/subscriptions
Body: { student_id, plan_id, payment_method_id }
Response: { subscription, first_invoice }

GET /api/v1/portal/:customer_token/subscription
(no login, JWT signed token sent via email)

POST /api/v1/portal/:customer_token/pause
Body: { until_date }

POST /api/v1/portal/:customer_token/cancel
Body: { reason }
```

Webhook handlers necesari:
- `payment_intent.succeeded` → mark invoice paid + generate e-Factura
- `payment_intent.payment_failed` → schedule retries + notify
- `customer.subscription.deleted` → cleanup

# Acceptance criteria

- [ ] Prima plată salvează cardul pentru viitor (Stripe `off_session`)
- [ ] Cron-ul zilnic la 09:00 procesează toate subscriptions scadente
- [ ] Reminder cu 3 zile înainte e trimis EXACT o dată per ciclu
- [ ] Retry la zi+3, zi+5, zi+7 după failure
- [ ] Past_due suspendă accesul la lecții online (config per centru)
- [ ] Pause respectă perioada exactă (nu încasează în interval)
- [ ] Cancel rămâne activ până la finalul ciclului plătit
- [ ] e-Factura ANAF generată în max 5 minute după succeeded

# Edge cases

- Plată parțială (Stripe nu suportă, dar PayU da): split în două invoices
- Currency conversion (părinte plătește în EUR, centru raportează în RON): folosim cursul BNR de ziua respectivă, salvat în payment_attempts
- 3DSecure necesar pentru recurrence: Stripe handles, dar trebuie notification dacă SCA challenge eșuează
- Plată dublă (părinte plătește manual + cron încasează): refund automat al duplicării
- Disputa / chargeback: webhook `charge.dispute.created` → notificare urgentă manager + suspendare auto

# Dependențe

- **Externe**: Stripe API, PayU API, MobilPay API, e-Factura ANAF SPV
- **Interne**: `notifications`, `invoices`, `audit_log`, `student_access_control`

# Risc & GDPR

- Nu stocăm date card. Folosim Stripe Vault.
- Storăm doar `last4`, `brand`, `exp_month`, `exp_year` pentru UI
- Logul plăților = audit, retenție conform cerințelor fiscale (10 ani RO)
- PCI-DSS: doar SAQ-A (cea mai simplă), pentru că nu atingem date card

# Out of scope

- Plată cu Apple Pay / Google Pay — `F-FIN-WALLET-001`
- Plată în rate (instalments) — `F-FIN-INSTALL-001`
- BNPL (Klarna, Twisto) — `F-FIN-BNPL-001`
- Cripto — out of scope permanent
