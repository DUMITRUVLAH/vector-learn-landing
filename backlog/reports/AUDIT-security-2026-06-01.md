# Vector Learn — Security Audit Report (2026-06-01)

**Auditor:** Senior Security Auditor (automated review — security-auditor agent)
**Scope:** `server/` (Hono API), `src/` (React frontend), `server/db/schema/` (Drizzle), Vercel/Supabase deployment config
**Method:** Manual code review of authentication, multi-tenant isolation, authorization, input validation, secrets, GDPR/PII, dependencies, and OWASP Top 10.

> Saved by the orchestrator: the auditor agent ran read-only (Read/Grep/Glob) and could not create the file itself. Content delivered inline and persisted here verbatim.

---

## Severity counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 5 |
| Medium | 7 |
| Low | 6 |
| **Total** | **19** |

Overall, the codebase shows **disciplined, consistent tenant-scoping** in the vast majority of routes (`and(eq(table.id, id), eq(table.tenantId, tenantId))` is the pervasive pattern, applied correctly in leads, students, contracts, contacts, notifications, analytics, payroll-read, tasks, etc.). The auth primitives (bcrypt, random 48-byte session tokens, httpOnly cookies) are sound. The main systemic weaknesses are: **(1) no role-based authorization layer at all**; **(2) a handful of routes that trust a foreign-key ID from the request body/param without verifying it belongs to the tenant**; **(3) reflected/stored XSS in the contract HTML export**; and **(4) total absence of rate limiting** despite the dependency being installed.

---

## CRITICAL

### C-1. Stored/Reflected XSS in contract HTML export (served as `text/html`)
- **File:** `server/routes/contracts.ts:255-339` (`renderContractHtml`), served at `server/routes/contracts.ts:211-233` (`GET /api/contracts/:id/pdf`).
- **Vulnerability:** Every user-controlled contract field (`beneficiaryName`, `idn`, `companyName`, `companyIdno`, `repName`, `repRole`, `course`, `scheduleText`, `language`, `location`, `number`) is interpolated raw into an HTML template string with **no escaping**, then returned with `Content-Type: text/html; charset=utf-8` (line 227). Although `Content-Disposition: attachment` is set, browsers can still render the document if opened directly, and the same-origin URL executes in the app's origin context.
- **Why exploitable:** `createContractSchema` (lines 67-90) places no character restrictions — `beneficiaryName: z.string().max(300)` accepts `<script>...</script>`. Script runs with the viewing staff member's session via same-origin `fetch` (cookie is httpOnly so token isn't readable, but actions-as-victim and data exfiltration are possible).
- **Fix:** HTML-escape every interpolated value:
  ```ts
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!));
  ```
  Use `${esc(...)}` everywhere. Serve with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` + `Content-Disposition: attachment`. Confidence: **High**.

---

## HIGH

### H-1. No role-based authorization anywhere — every authenticated user is effectively an admin
- **Files:** `server/middleware/requireAuth.ts` (only checks authentication, never role); absent across `payroll.ts`, `auditLog.ts`, `payments.ts`, `pipeline.ts`, `analytics.ts`, `leads.ts`, `students.ts`, `contracts.ts`. The only role checks in the entire server are `lessons.ts:289`, `saved-views.ts:78-80`, `leads-today.ts:36-38`.
- **Vulnerability:** The `users` table has 6 roles (`admin, manager, teacher, receptionist, student, parent` — `server/db/schema/users.ts:4-11`), but mutating/exporting endpoints never gate on role. A teacher/receptionist (or student/parent if such login exists) can: read all salaries & commissions (`GET /api/hr/payroll`, `payroll.ts:20`) and trigger recalculation (line 55); read/edit/bulk-delete all leads/students/payments; export the full audit log (`auditLog.ts:48`, `audit.ts:25`); create/delete pipeline stages (`pipeline.ts` header comment claims a check that doesn't exist); GDPR-erase leads in bulk (`leads.ts:1196`).
- **Why exploitable:** Broken access control (OWASP A01). Any low-privilege staff member with a session can perform privileged financial/PII operations.
- **Fix:** Add `requireRole(...roles)` middleware reading `c.get("user").role`. Apply to payroll (admin/manager), audit-export (admin/manager), pipeline mutations (admin/manager), payments mutations (admin/manager/receptionist), bulk delete / GDPR erasure (admin). Confidence: **High**.

### H-2. `POST /api/payments` accepts a `studentId` without verifying it belongs to the caller's tenant
- **File:** `server/routes/payments.ts:79-96`.
- **Vulnerability:** Inserts a payment with `tenantId` from session but `studentId: body.studentId` straight from the request (line 86), never checking the student exists in this tenant. The list query's join is on `payments.studentId = students.id` with no tenant predicate on `students` (line 40-41), so a cross-tenant student row will be joined and its `fullName` returned (line 37).
- **Fix:** Verify `students.id + students.tenantId` before insert (404 otherwise); add `eq(students.tenantId, tenantId)` to the join. Confidence: **High**.

### H-3. No rate limiting on authentication or public intake (brute force / enumeration / spam)
- **Files:** `server/routes/auth.ts:91` (login), `server/routes/leads.ts:157` (`/intake`), `server/routes/feedbackPublic.ts` (public submit). `hono-rate-limiter` is in `package.json:40` but **zero usages** in `server/`.
- **Vulnerability:** Unlimited credential stuffing (passwords only `min(8)`, `auth.ts:15`); public `/intake` (no auth) floodable, IP is attacker-controlled via `x-forwarded-for` (`leads.ts:190`); feedback submit brute-forceable over UUID tokens. OWASP A07.
- **Fix:** Apply `hono-rate-limiter`: ~10/min/IP on login, ~5/min/IP on intake & feedback. Consider per-account login backoff. Confidence: **High**.

### H-4. `POST /api/leads/:leadId/tasks` and `/attachments` trust `leadId` without verifying tenant ownership
- **File:** `server/routes/tasks.ts:46-65` (create task), `:144-164` (create attachment).
- **Vulnerability:** Both INSERTs use session `tenantId` but `leadId` straight from the URL with no ownership check (contrast PATCH/DELETE/GET in the same file, and `contacts.ts:24-28` which calls `getLeadForTenant`). Creates poisoned data referencing a foreign `leadId`; `fileUrl` accepts arbitrary 1000-char strings/data URLs. OWASP A01.
- **Fix:** Verify `leads.id + leads.tenantId` first (404 otherwise). Confidence: **High**.

### H-5. `POST /api/auth/__dev__/setup-demo-password` reachable in production behind a single shared secret
- **File:** `server/routes/auth.ts:143-158`.
- **Vulnerability:** Sets every `$placeholder$`-hash user to the publicly documented password `demo123456` (line 151). In non-prod it runs with no auth; in prod requires only `x-demo-reset-secret == DEMO_RESET_SECRET`. No rate limit; response leaks the password (line 157).
- **Fix:** Remove from production builds (compile-time guard or delete). At minimum strong random secret, never echo the password, rate-limit, gate even non-prod behind the secret. Confidence: **High**.

---

## MEDIUM

### M-1. Real production credentials present in working-tree `.env` / `.env.local`
- **Files:** `.env:6-26`, `.env.local:23-37`.
- **Finding:** Live Supabase Postgres password, the Supabase `service_role` JWT (bypasses all RLS), `SUPABASE_JWT_SECRET`, `SUPABASE_SECRET_KEY` (`sb_secret_...`), a Vercel OIDC token. `.gitignore:5-6,34` covers them, so per git status they are **not tracked** (hence Medium). Committed `.env:4` ships `AUTH_SECRET=local-dev-secret-please-change-in-production-min32chars` as default.
- **Fix:** (1) Treat password, service-role key, `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET` as compromised and **rotate**. (2) Confirm `git log --all -- .env .env.local` they were never committed. (3) Don't store the service-role key beside app code; the app doesn't need it. Confidence: High (secrets real); Medium (history not verified).

### M-2. CSV injection (formula injection) in audit-log and CRM exports
- **File:** `server/routes/auditLog.ts:48-86` (`csvField` lines 66-72 quotes `,"`/newline but doesn't neutralize formula prefixes).
- **Vulnerability:** Fields like `actorName`/`actionType` starting with `= + - @` execute in Excel/Sheets (`=HYPERLINK(...)`, etc.).
- **Fix:** Prefix any field starting with `= + - @ \t \r` with a single quote/space. Confidence: High.

### M-3. No security-headers / CSP middleware
- **Files:** `server/app.ts` (only `logger()` + `cors()`); no `secureHeaders`, CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS.
- **Fix:** Add Hono `secureHeaders()` + strict CSP. Confidence: High.

### M-4. Session tokens never rotate; 30-day TTL, no idle/absolute timeout
- **Files:** `server/auth/session.ts:6` (`SESSION_TTL_MS = 30 days`); new row per login, old sessions never invalidated; `purgeExpiredSessions` (`session.ts:38`) not scheduled anywhere found.
- **Fix:** Shorter TTL (~7d) + sliding refresh, rotate token on login, "log out everywhere", schedule purge. Confidence: Medium (scheduler may be external).

### M-5. CORS origin reflection falls back to permissive default and is credentialed
- **File:** `server/app.ts:52-58`. `origin: (o) => allowedOrigins.includes(o) ? o : allowedOrigins[0]` with `credentials: true`; `allowedOrigins[0]` hardcoded `http://localhost:5173` (line 48).
- **Vulnerability:** Not an open hole (browser rejects the mismatch), but hardcoding localhost as the always-present first prod entry is fragile; a misconfigured `ALLOWED_ORIGINS` silently degrades to localhost.
- **Fix:** Return `null`/omit header for disallowed origins; drop localhost from the prod allow-list. Confidence: Medium.

### M-6. Public feedback submit doesn't verify `questionId` belongs to the invitation's form
- **File:** `server/routes/feedbackPublic.ts:75-116`. Answers inserted (line 99) with `questionId` validated only as UUID (line 66), never checked against `feedbackQuestions` for `invitation.formId`.
- **Vulnerability:** Unauthenticated cross-tenant write of attacker answer rows, polluting another tenant's analytics.
- **Fix:** Load the form's question IDs and reject answers outside that set. Confidence: High.

### M-7. GDPR "erasure" leaves PII in append-only audit snapshots
- **Files:** `server/routes/leads.ts:1140-1182` anonymizes the lead + interactions, but `auditLog(...)` writes full before/after snapshots (name/phone/email) into `crmAuditLog.beforeSnapshot` (`leads.ts:25-32`, used at 605, 666, 1330, 1346-1349); CRM-delete stores the entire lead row in the audit snapshot and in-memory `undoStore` (line 1355).
- **Vulnerability:** GDPR erasure leaves the subject's full PII recoverable from `crm_audit_log` JSON indefinitely.
- **Fix:** On erasure, purge/anonymize the entity's audit snapshots (or store only non-PII field-diff keys). Define a retention policy. Confidence: High.

---

## LOW

### L-1. Email enumeration via signup
- **File:** `server/routes/auth.ts:53-54` returns `email_taken` (409). Login is correctly uniform (`invalid_credentials`, lines 97/101). **Fix:** neutral response or rate-limit signup. Confidence: High.

### L-2. Login not constant-time for unknown users (timing oracle)
- **File:** `server/routes/auth.ts:93-102`. Unknown email returns immediately (line 97) without bcrypt; known email runs `verifyPassword` (~100ms). **Fix:** dummy bcrypt compare when user not found. Confidence: High.

### L-3. `saved-views` role check references non-existent role `"owner"`
- **File:** `server/routes/saved-views.ts:78` checks `user.role === "owner"`, but the enum (`users.ts:4-11`) has no `owner` (it's `admin`). The "admin can delete any view" path never triggers. Same conceptual issue at `leads-today.ts:38`. **Fix:** use `"admin"`. Confidence: High.

### L-4. Attachment `fileUrl` accepts arbitrary data/blob URLs (1000 chars, no scheme/MIME validation)
- **File:** `server/routes/tasks.ts:122-126, 144-164`. If rendered as a link/image, `javascript:`/`data:text/html` become XSS vectors. **Fix:** validate scheme + constrain `mime`. Confidence: Medium (depends on frontend rendering).

### L-5. `x-forwarded-for` trusted verbatim for consent IP
- **File:** `server/routes/leads.ts:190`. Spoofable `ipAtConsent` weakens GDPR consent audit trail. **Fix:** derive client IP from the trusted proxy hop (Vercel header). Confidence: High.

### L-6. Verbose DB error messages returned to clients on health endpoints
- **File:** `server/app.ts:68-71`, `:130-132` return `error.message` from DB failures (public, before auth, line 63). **Fix:** log server-side, return generic message. Confidence: High.

---

## What is done well

- **Tenant isolation correct in the overwhelming majority of routes** — leads, students, contracts, contacts, notifications, analytics, payroll-read, audit-log, saved-views, pipeline, tasks (read/update/delete); bulk-action re-fetches owned IDs (`leads.ts:1202-1207`); undo-restore double-checks `snap.tenantId !== tenantId` (`leads.ts:1388`).
- **Parameterized queries throughout** — Drizzle query builder / tagged `sql`; `ilike('%'+search+'%')` are bound params, not injection. Only raw SQL is a static `information_schema` count (`app.ts:113-114`). **No SQL injection found.**
- **React auto-escaping** — no `dangerouslySetInnerHTML`, `innerHTML`, or `eval` in `src/`. Only HTML-injection sink is the server-side contract export (C-1).
- **Sound auth primitives** — bcrypt cost 10 (`password.ts:3`), `crypto.randomBytes(48)` base64url tokens (`session.ts:9-11`), httpOnly + SameSite=Lax + secure cookies (`auth.ts:34-44`), expiry enforced on read (`session.ts:25-28`).
- **Validation discipline** — nearly every endpoint uses `zValidator` with bounded lengths, enums, UUID checks.
- **No client-bundle secret leakage** — only `VITE_API_URL` exposed (`vite-env.d.ts:4`); Supabase keys never imported into `src/`.

---

## Dependency / supply-chain

Deps recent and mainstream (Hono 4.6, Drizzle 0.36, bcryptjs 3, zod 3.23, React 18.3). No obvious abandoned/CVE packages by inspection. **`npm audit` not run** (read-only session) — run `npm audit` + `npm audit --production` in CI. `hono-rate-limiter` installed but unused (H-3) — wire it or remove it.

---

## Prioritized remediation roadmap

1. **Now (Critical/High):** Escape contract HTML (C-1); add `requireRole` middleware and gate payroll/audit-export/pipeline/payments/GDPR-delete (H-1); verify `studentId` tenant on payment create + fix the join (H-2); wire rate limiting on login/intake/feedback (H-3); verify `leadId` tenant on task/attachment create (H-4); remove/lock the demo-password endpoint from prod (H-5).
2. **This week (Medium):** Rotate the Supabase service-role key, DB password, JWT secret (M-1); neutralize CSV formula injection (M-2); add `secureHeaders` + CSP (M-3); shorten/rotate sessions + schedule purge (M-4); fix CORS fallback (M-5); validate `questionId` ownership (M-6); purge PII from audit snapshots on erasure (M-7).
3. **Backlog (Low):** Constant-time login + neutral signup (L-1, L-2); fix `"owner"`→`"admin"` (L-3); validate attachment URL scheme (L-4); harden consent-IP (L-5); stop returning raw DB errors (L-6).

---

## Could not fully verify (needs follow-up with exec tooling)
`npm audit` results; git history of `.env` files; whether `purgeExpiredSessions` is scheduled; exact frontend rendering of attachment `fileUrl`.
