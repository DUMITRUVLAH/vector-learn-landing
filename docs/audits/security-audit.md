# Vector Learn — Security Audit (2026-06-02)

**Scope:** `server/` (Hono API, 80+ routes), `src/` (React), Drizzle ORM, Stripe, auth/2FA/API-keys, GDPR. Read-only review.
Builds on `backlog/reports/AUDIT-security-2026-06-01.md` — several prior Critical/High items remain unfixed and are re-flagged.

## Severity counts

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 6 |
| Medium | 6 |
| Low | 4 |
| **Total** | **20** |

Core tenant-scoping discipline (`and(eq(table.id,id), eq(table.tenantId,tenantId))`) is correct across most routes. Serious problems concentrate in **payments/Stripe, the API-key auth model, and still-unfixed items** (no role layer, contract XSS, no rate limiting).

---

## CRITICAL

### C-1. Stripe webhook signature verification skipped when no webhook secret configured → forge "invoice paid"
- **File:** `server/routes/stripe.ts:239-348` (esp. `:297` `if (settings?.webhookSecretEncrypted) {`).
- **Exploit:** `POST /api/webhooks/stripe` parses the body unverified (`:257`), reads `metadata.invoice_id` from attacker JSON, loads the invoice to find its tenant, and only verifies the Stripe signature **if that tenant has a `webhookSecretEncrypted`**. A tenant with Stripe keys but no webhook secret gets no signature check. Unauthenticated attacker who guesses an invoice UUID sends `{"type":"payment_intent.succeeded","data":{"object":{"metadata":{"invoice_id":"<uuid>"}}}}` → invoice marked `paid` (`:312-322`, `:332-344`) — financial fraud / free enrollment.
- **Fix:** Require a configured webhook secret; reject (`400 webhook_not_configured`) if missing. Verify signature on raw body **before** any DB lookup.

### C-2. Stripe secret keys & webhook secrets stored as base64 (effectively plaintext)
- **File:** `server/lib/stripe.ts:9-20` — `encryptKey`/`decryptKey` are base64 round-trips. File comment says "swap with AES-256 in production."
- **Exploit:** `stripe_settings.secretKeyEncrypted` holds `sk_live_...` recoverable by anyone with DB/backup/log read access. A live key allows charging cards, refunds, reading all Stripe data. Real AES-256-GCM already exists in `server/auth/twoFactor.ts:27-48`.
- **Fix:** Encrypt with AES-256-GCM keyed by `ENCRYPTION_KEY` (reuse `twoFactor.ts`). Rotate all stored keys after fix. Same for `webhookSecretEncrypted`.

### C-3. Stored/Reflected XSS in contract HTML export (UNFIXED)
- **File:** `server/routes/contracts.ts:291-368` (`renderContractHtml`), served at `:247-268` as `text/html`.
- **Exploit:** Every user field (`beneficiaryName`, `companyName`, `repName`, `course`, `scheduleText`, `location`) interpolated raw (`:316`, `:320-322`, `:355-360`), no escaping, no char restrictions in schema. `<script>`/`<img onerror>` executes in same origin when staff open the export → session-riding, exfiltration.
- **Fix:** HTML-escape every value (`&<>"'`); serve with `CSP: default-src 'none'` + `Content-Disposition: attachment`.

### C-4. `X-API-Key` always authenticates as tenant admin — no scoping, full privilege
- **File:** `server/middleware/requireApiKey.ts:51-67`.
- **Exploit:** Any valid API key resolves to the tenant's **admin** (`role:"admin"`, `:52-54`); no per-key scope model. A read-only Zapier key is effectively a full-takeover credential (delete leads/students, issue refunds, change settings). Key lookup itself (bcrypt by 8-char prefix) is sound; the privilege grant is the problem.
- **Fix:** Add `scopes`/`permissions` column to `api_keys`; resolve to a synthetic principal limited to scopes (default read-only). Never silently elevate to admin.

---

## HIGH

### H-1. No role-based authorization anywhere (UNFIXED)
- **Files:** `server/middleware/requireAuth.ts` only authenticates; no `requireRole` middleware exists. Only 7 route files do ad-hoc role checks (`lessons.ts`, `team.ts`, `settings.ts`, `parentPortal.ts`, `mobile.ts`, `saved-views.ts`, `auditLogSettings.ts`).
- **Exploit:** `users` enum has 6 roles, but `payroll.ts`, `auditLog.ts`, `payments.ts`, `refunds.ts`, `pipeline.ts`, `leads.ts` (bulk delete/GDPR-erase), `stripe.ts` settings never gate on role. Any teacher/receptionist can read salaries, issue refunds, export audit log, bulk-delete leads.
- **Fix:** Add `requireRole(...roles)` reading `c.get("user").role`; apply to payroll/audit-export/refunds/payments-mutations/pipeline/GDPR-delete/Stripe-settings.

### H-2. `POST /api/payments` & `POST /api/invoices` accept `studentId` without tenant ownership check (UNFIXED)
- **Files:** `server/routes/payments.ts:85-142` (insert with body `studentId`, unchecked); `payments.ts:45` join on `students` has no tenant predicate; `server/routes/invoices.ts:11-19` same.
- **Exploit:** Insert a payment/invoice referencing a cross-tenant student UUID; GET list join returns foreign student's `fullName` — cross-tenant PII leak + data poisoning.
- **Fix:** Verify `students.id + students.tenantId` before insert; add `eq(students.tenantId, tenantId)` to all joins on `students`.

### H-3. No rate limiting on auth or public intake (UNFIXED)
- **Files:** `auth.ts:94` (login), `leads.ts:183` (`/intake`), `publicForms.ts` submit/ping, `feedbackPublic.ts`. `hono-rate-limiter` is in deps but unused. In-memory limiters (`auth.ts:163-177`, `certificatesPublic.ts:29`) are ineffective on Vercel serverless (fresh process per invocation).
- **Exploit:** Unlimited credential stuffing (passwords only `min(8)`); public intake/forms floodable for spam/DoS/DB bloat; `forms/:slug/ping` does an unauthenticated atomic UPDATE per call.
- **Fix:** Durable limiter (Upstash/Redis) on login (~10/min/IP + per-account backoff), intake/forms/feedback (~5/min/IP).

### H-4. Refunds gated only by `requireAuth` — any staff can refund real Stripe money
- **File:** `server/routes/refunds.ts:20,29-153`. `POST /api/invoices/:id/refund` calls `createStripeRefund` (`:83`) for any authenticated user.
- **Fix:** `requireRole("admin","manager")`; add amount/approval threshold.

### H-5. `POST /api/leads/:leadId/tasks` and `/attachments` trust `leadId` without tenant check
- **File:** `server/routes/tasks.ts` — create task/attachment insert using URL `leadId` + session `tenantId`, no ownership check (contrast GET/PATCH/DELETE).
- **Exploit:** Poisoned task/attachment rows on foreign-tenant `leadId`; `fileUrl` accepts arbitrary 1000-char strings incl. `data:`/`javascript:`.
- **Fix:** Verify `leads.id + leads.tenantId` (404) before insert; validate `fileUrl` scheme.

### H-6. `POST /api/auth/__dev__/setup-demo-password` reachable in prod, echoes the password (UNFIXED)
- **File:** `auth.ts:391-406`. Sets every `$placeholder$`-hash user to `demo123456`, returns it; in prod gated only by one shared `x-demo-reset-secret` header, no rate limit.
- **Fix:** Compile-time strip from prod; never echo password; rate-limit.

---

## MEDIUM

### M-1. Stripe webhook binds verification to attacker-supplied invoice's tenant (defense-in-depth)
- **File:** `stripe.ts:270-309`. Persist & verify the Stripe account/connected-account id per tenant; reject mismatches.

### M-2. Public feedback submit doesn't verify `questionId` belongs to the invitation's form (UNFIXED)
- **File:** `feedbackPublic.ts:65-106`. Answers (`:99`) inserted with any UUID `questionId`. Cross-tenant write poisoning analytics. Fix: validate against the form's question-id set.

### M-3. Public/webhook tenant routing — Meta lead webhook assigns to a random tenant
- **Files:** `webhooks.ts:176` (`db.query.tenants.findFirst()`), `publicForms.ts:44`, `enroll.ts`. Route Meta leads by stored `page_id → tenant` mapping; reject if unmapped.

### M-4. No security headers / CSP (UNFIXED)
- **File:** `server/app.ts:76-89` — only `logger()` + `cors()`. Add Hono `secureHeaders()` + strict CSP.

### M-5. CORS reflects to hardcoded localhost fallback, credentialed (UNFIXED)
- **File:** `app.ts:78-89`. `credentials:true` with `allowedOrigins[0]` = `http://localhost:5173` as fallback. Return no CORS header for disallowed origins; drop localhost from prod allow-list.

### M-6. Global `onError` & health endpoints leak raw error messages (UNFIXED)
- **File:** `app.ts:71-74` returns `err.message`; `:188-223` health returns raw DB error pre-auth. Log server-side; return generic message + request id.

---

## LOW

- **L-1.** Session TTL 30d, no rotation/idle timeout, purge unscheduled (`server/auth/session.ts:6,72`). → ~7d + sliding refresh, rotate on login, schedule purge.
- **L-2.** CSV/formula injection in audit-log & CRM exports (`auditLog.ts` `csvField` doesn't neutralize `= + - @`). → prefix dangerous leading chars.
- **L-3.** Email enumeration on signup + non-constant-time login (`auth.ts:56-57`, `:99-101`). → neutral response, dummy bcrypt on unknown user.
- **L-4.** `x-forwarded-for` trusted verbatim for GDPR consent IP (`leads.ts:216`, `publicForms.ts:175-178`). → derive from trusted Vercel proxy header.

---

## Verified correct / done well
- Tenant scoping consistent in students, leads, contracts, invoices (incl. branch scope), refunds-list, portal/parentPortal token chains.
  - **Correction 2026-06-02:** `apiKeys` was listed here, but the route was **never mounted** in `app.ts` — its tenant scoping had never actually executed in prod. Now mounted (see architecture review §1.1). Re-verify its scoping is now live; the new `webhookSettings.ts` route is tenant-scoped on every query (list/create/patch/delete/deliveries).
- Auth primitives sound: bcrypt cost 10, `randomBytes(48)` tokens, httpOnly+SameSite=Lax+secure cookies, 2FA real AES-256-GCM, disabled-user block.
- Parameterized queries throughout (Drizzle); no SQL injection. No `dangerouslySetInnerHTML`/`eval` in `src/`. No client-bundle secret leakage observed.

## Top 5 most urgent
1. **C-1** — Stripe webhook marks invoices paid without signature verification (`stripe.ts:297`).
2. **C-2** — Stripe secret keys stored as base64, not encrypted (`lib/stripe.ts:9-20`).
3. **C-4** — Any `X-API-Key` logs in as tenant admin, no scoping (`requireApiKey.ts:52`).
4. **C-3** — Unescaped contract HTML export → stored XSS (`contracts.ts:316-362`).
5. **H-1 + H-4** — No role layer; refunds gated only by `requireAuth`.
