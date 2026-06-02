---
title: Stripe webhook marked invoices paid without signature verification when no secret configured
problem_type: security_issue
module: payments
tags: [stripe, webhook, signature, fraud, invoice, paid, constructEvent]
symptoms: Unauthenticated POST with a guessed invoice UUID marks the invoice paid (free enrollment)
severity: P0
date: 2026-06-02
---

## Symptom
The `POST /api/webhooks/stripe` handler marked an invoice `paid` for an unauthenticated request, with no valid Stripe signature, whenever the tenant had not configured a webhook secret.

## Root cause
The verification was guarded by `if (settings?.webhookSecretEncrypted) { verify... }`. When a tenant had no secret, the block was skipped and the code fell through to `update(invoices).set({ status: "paid" })`. An attacker who guessed an invoice UUID could POST a fake `payment_intent.succeeded` and get a free enrollment / fraudulent paid status.

## Fix
Make signature verification **mandatory**: no configured secret (or failed `constructWebhookEvent`) ⇒ return 400 and never mutate. Verify against the raw body before any DB write.

## How to avoid next time
- Webhook/callback handlers that mutate financial state must reject anything they cannot cryptographically verify — "no secret configured" means "don't trust", not "skip the check".
- Keys are now encrypted at rest (AES-256-GCM via `server/lib/crypto.ts`), not base64. Rotate any keys stored before that fix.
- Covered by the `ce-security-reviewer` / adversarial review on payment-touching diffs.
