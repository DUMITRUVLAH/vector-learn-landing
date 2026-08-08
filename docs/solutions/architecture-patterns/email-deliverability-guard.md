---
title: e2e/demo traffic sent real Resend emails to @atic.demo.io → hard bounces on the product's sending domain
problem_type: architecture_pattern
module: messaging, par-notifications, auth-emails
tags: [resend, email, deliverability, bounce, sender-reputation, e2e, demo-tenant, seed]
symptoms: Resend dashboard full of "Bounced" rows to approver@/admin@/finance@/requestor@atic.demo.io with subjects like "[PAR] PAR-2026-0091 — aprobare necesară"
severity: P1
date: 2026-08-08
---

## Symptom
Dozens of `Bounced` emails in the Resend dashboard, all to the seeded PAR demo users
(`admin@ / approver@ / finance@ / requestor@atic.demo.io`), subjects `[PAR] PAR-2026-00XX — aprobare
necesară / changes requested / ready for payment / aprobată`, clustered in a single hour.

## Root cause
Two things combined:

1. `atic.demo.io` is a made-up domain from `server/db/seed.ts` — no MX record, so every message is a
   **hard bounce**.
2. The email providers only stubbed the send when `RESEND_API_KEY` was **absent**
   (`server/services/messaging/providers.ts`, `server/lib/par/invites.ts`,
   `server/lib/auth/accountEmails.ts`). The local `.env` carries a **real** key, so the PAR e2e/QA
   sweeps (`scripts/e2e-par-*.mjs`, which submit → approve → request-changes → pay dozens of PARs as
   those demo users) pushed every notification through Resend for real — from `noreply@finflow.best`.

Hard bounces are charged to the sending domain's reputation. Resend suspends accounts around a ~5%
bounce rate, so test traffic was spending the product's real deliverability.

## Fix
One guard, `server/lib/emailGuard.ts`, called by all three send paths before any HTTP request:

- `EMAIL_SEND_MODE=off` → kill switch, nothing leaves.
- Recipient domain undeliverable (RFC-reserved `.test/.invalid/.localhost/.example/example.com`, or a
  seeded demo domain `*.demo.io`, `demo.vectorlearn.io`) → blocked **in every environment**.
- `NODE_ENV !== "production"` → blocked unless `EMAIL_SEND_MODE=on` (local + e2e default is no-send).
- `EMAIL_ALLOWLIST` (comma-separated addresses/domains), when set → only those may receive.

Seeded CRM leads also moved off real-looking `@gmail.com` / `@mail.md` addresses onto
`@demo.vectorlearn.io`, so a demo click in prod cannot mail a real stranger either.

Regression: `server/__tests__/emailGuard.test.ts` (fails on the pre-guard code, which allowed everything).

## How to avoid next time
- **The absence of an API key is not a safety mechanism.** Any code path that can reach a real
  provider (email, SMS, payments, e-Factura) needs an explicit environment/recipient gate, because
  `.env` on a dev machine holds production credentials.
- Test/demo fixtures must use domains that can never resolve, and the guard must know them.
- Turning real sends on for a debugging session = `EMAIL_SEND_MODE=on EMAIL_ALLOWLIST=your@address`,
  never "remove the guard".
