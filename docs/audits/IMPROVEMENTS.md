# Vector Learn — Lista consolidată de îmbunătățiri (2026-06-02)

Compilată din 6 audituri paralele + o sesiune de e2e-testing pe app-ul real. Rapoarte sursă:
[security](security-audit.md) · [performance](performance-audit.md) · [database](database-audit.md) · [architecture](architecture-review.md) · [code-quality](code-quality-audit.md) · [scalare 1000 useri](scalability-1000-users.md)

Prioritizare: **P0 = rupe prod / fraudă acum** → **P3 = igienă**. Marcat `[verificat]` ce am confirmat direct în cod, `[✅ REPARAT 2026-06-02]` ce am reparat deja în sesiunea de e2e.

---

## ✅ Reparate în sesiunea de e2e (2026-06-02) — verificate cu browser real

Un sweep cu browser real ([`scripts/e2e-smoke.mjs`](../../scripts/e2e-smoke.mjs), extins de la 23 la ~45 rute + pagini de detaliu cu ID-uri reale) + gate-ul de migrări au scos la iveală 3 bug-uri **care rupeau deploy-ul fresh și orice DB nou** — toate reparate:

- **F1. Migrări multi-statement fără `--> statement-breakpoint`** (23 fișiere). `db:reset` murea cu `cannot insert multiple commands into a prepared statement` pe PGlite → local dev, testele și gate-ul de migrări erau rupte. Reparat (split dollar-quote-aware). _(vezi database §1c)_
- **F2. Schema drift cod-vs-migrări:** tabelul `webhook_events` + 6 coloane `leads` + 2 coloane `homework_submissions` existau în cod dar **nicio migrare nu le crea** → `db:seed` pica, fresh-deploy ar fi dat 500. Reparat cu [`0109_schema_drift_backfill.sql`](../../drizzle/0109_schema_drift_backfill.sql) idempotent. _(vezi database §1b)_
- **F3. 2 din cele ~41 rute orfane montate:** `/app/settings/api-keys` și `/app/settings/webhooks` afișau `Unexpected token '<'` (fallback SPA). `apiKeyRoutes` nu era montat; backend-ul webhooks-settings **nu exista deloc** → creat [`webhookSettings.ts`](../../server/routes/webhookSettings.ts). _(vezi architecture §1.1, contrazice security „done well")_

### Sesiunea 2 (continuare 2026-06-02) — fix-uri + guardrails în framework

- **~37 rute orfane montate** (#1) cu prefixe verificate din frontend + boot real + live GET sweep. Rămân 2 `mount-exempt` (mobile — bug real de schemă; webhooks Meta inbound).
- **#2 webhook Stripe** — semnătură obligatorie (zero mutație fără verificare). **#3 chei Stripe** — AES-256-GCM (`server/lib/crypto.ts`). **#4** — `index.ts` refolosește `app.ts` (gata cu cele 8-vs-56 rute + bug `.rows`). **#8** — ErrorBoundary global. **Drift invers `tenants`** — 6 coloane existau în DB dar nu în schemă → 500 pe 3 endpoint-uri settings, acum declarate.
- **Guardrails noi în framework** (ca să NU se mai repete — rulate în `vercel.json` build + `.github/workflows/prod-safety.yml` CI):
  - `scripts/check-route-mounts.mjs` — orice router Hono neapelat în `app.ts` pică build-ul (clasa #1).
  - `scripts/check-migration-breakpoints.mjs` — migrare multi-statement fără breakpoint pică build-ul (clasa F1).
  - `schema-drift.test.ts` rulat în CI (clasa F2).
  - `e2e-smoke.mjs` prinde „Unexpected token" (simptomul UI al unei rute orfane).
- Learnings scrise în `docs/solutions/` (orphan-route, statement-breakpoints, inverse-drift, stripe-webhook) + reguli noi în CLAUDE.md §3.5.1.

Reziduuri rămase: monta `mobileRoutes` după rescriere; gate de drift bidirecțional (DB→cod); restul listei P1–P3 de mai jos.

---

## P0 — Se rupe în producție / fraudă financiară (fix imediat)

1. **~41 rute nu-s montate în `server/app.ts`, iar frontend-ul le cheamă** `[verificat]` · `[✅ ~39/41 REPARAT 2026-06-02]`
   Erau orfane întregi verticale (School/K-12, messages, accounting, AI×4, branches, settings, 2FA, …).
   **Reparat acum:** montate ~37 routere (school+grades+timetable+tuition+admissions, ai+aiChurn+aiLeads+aiSettings, branches+branchReports, accounting, messages, broadcasts, forms, groups, consent, promoCodes, paymentPlans, lessonPackages, refunds, reminders, waitlist, guardians, homework×3, progress, attendance, certificatesIssue, users, tenantSettings, settings/rr-assign, parentPortal, portalInvoice, stripe×2, 2FA, sessions) + api-keys/webhooks (F3). Verificate cu boot real + live GET sweep (JSON, nu HTML). **Gate `scripts/check-route-mounts.mjs` activ** (build + CI) — nu mai pot apărea orfane noi.
   **Rămân 2, `mount-exempt`:** `mobileRoutes` (bug real: importă un export `homework` inexistent — necesită rescriere peste `lesson_homework`+`homework_submissions`); `webhookRoutes` (Meta lead-ads inbound, neapelat de frontend). _(architecture #1)_

1b. **Schema drift cod-vs-migrări — fresh deploy / DB nou dă 500** `[✅ REPARAT 2026-06-02 — F2]`
   Reparat cu `0109` idempotent. **Rezidual P1:** rulează `src/__tests__/schema-drift.test.ts` în deploy gate (există deja) și tratează un **tabel** lipsă ca eșec de build — `sync-schema.ts` adaugă doar coloane, nu tabele. _(database §1b)_

1c. **Migrări multi-statement fără breakpoint — `db:reset`/CI/teste rupte pe PGlite** `[✅ REPARAT 2026-06-02 — F1]`
   23 fișiere reparate. **Rezidual P2:** scan CI de ~10 linii „migrare cu >1 statement ⇒ are `--> statement-breakpoint`" (drizzle-kit generate e rupt pe repo, migrările-s scrise de mână). _(database §1c)_

2. **Webhook Stripe marchează facturi „paid" fără verificare de semnătură** `[✅ REPARAT 2026-06-02]`
   Era `stripe.ts:297` — verificarea era sărită când tenant-ul n-avea secret. Acum semnătura e
   OBLIGATORIE: fără secret sau semnătură invalidă → 400, zero mutație. _(security C-1; [solution](../solutions/security-issues/stripe-webhook-unsigned-mark-paid.md))_

3. **Cheile Stripe `sk_live_` stocate base64 (practic plaintext)** `[✅ REPARAT 2026-06-02]`
   Acum AES-256-GCM prin `server/lib/crypto.ts` (helper partajat), cu fallback de citire pe cheile
   base64 vechi (nu rupe tenanții existenți). **Rotează cheile după deploy** — base64-ul vechi era plaintext. _(security C-2)_

4. **`server/index.ts` e un entry-point stale** care montează 8 din 54 rute și încă are bug-ul `.rows` (`index.ts:71`) pe care `app.ts` l-a reparat. `dev-entry-contacts.ts` e un hack obsolet. `[verificat 2026-06-02]` — pentru e2e-ul local a trebuit să pornesc `dev-entry-contacts.ts` (singurul care montează app-ul complet); `npm start`/`stack:dev` rulează index.ts stale și dau un API 85% lipsă.
   → Elimină/consolidează entry-points; un singur app montat de toate (`index.ts`, `vercel-entry.ts`). _(architecture #2, database .rows)_

---

## P1 — Risc major (securitate / UX / scalare)

5. **Zero scoping pe rol — nu există `requireRole`.** Orice teacher/recepționer poate citi salarii, da refund-uri Stripe reale, exporta audit log, șterge bulk leads. `payroll/auditLog/payments/refunds/pipeline/leads`-delete nu verifică rolul.
   → Middleware `requireRole(...)` pe rutele financiare/distructive. _(security H-1, H-4)_

6. **`X-API-Key` = admin complet, fără scoping** (`requireApiKey.ts:52`). O cheie read-only de Zapier = takeover total.
   → Coloană `scopes` pe `api_keys`; principal sintetic limitat, default read-only. _(security C-4)_

7. **Bundle JS monolitic 723 KB gzip — 7× peste buget** `[verificat: zero React.lazy]`. Toate cele 77 de pagini importate static în `App.tsx`. Landing `/` și `/portal/invoice/:id` (neautentificat) plătesc tot. `jspdf+qrcode+jszip` (~340KB) intră prin `DiplomaPage`; recharts prin `RevenueChartsPage`.
   → `React.lazy()` per pagină + `manualChunks` (vendor-charts/vendor-pdf) în `vite.config.ts` + `import()` dinamic pe acțiunea de export PDF/ZIP. _(performance #1)_

8. **Niciun ErrorBoundary în tot SPA-ul.** `[✅ REPARAT 2026-06-02]`
   Creat `src/components/ErrorBoundary.tsx` (card de eroare recuperabil, design-system + dark mode),
   montat în `App.tsx` în jurul `<Routes/>`, keyed pe path (se resetează la navigare). _(code-quality #1)_

9. **XSS stocat în export-ul HTML de contract** (`contracts.ts:316-362`) — câmpuri user interpolate fără escape, servite `text/html`.
   → HTML-escape + `CSP: default-src 'none'` + `Content-Disposition: attachment`. _(security C-3)_

10. **Fără rate limiting pe login & intake public** (`hono-rate-limiter` e în deps dar nefolosit; limiter-ele in-memory nu merg pe Vercel serverless). Credential stuffing + flood/DoS.
    → Limiter durabil (Upstash/Redis) pe login + intake/forms/feedback. _(security H-3)_

11. **`studentId` acceptat fără verificare de tenant** la `POST /api/payments` și `/api/invoices` (`payments.ts:85`, `invoices.ts:11`) → leak PII cross-tenant la GET join.
    → Verifică `students.id + tenantId` înainte de insert; adaugă predicate de tenant pe toate join-urile pe `students`. _(security H-2)_

---

## P2 — Performanță DB & scalare (degradează liniar cu volumul)

12. **Indexuri lipsă — hotspots HIGH** _(database + performance, convergent)_:
    - `payments(tenantId, status, paidAt)` — scan complet la fiecare analytics (revenue by date range).
    - `invoices(tenantId, dueDate)` — sweep-ul de remindere overdue (`reminders.ts:78`).
    - gamification (`xp_events`, `student_streaks`, `badges`) — **zero indexuri**, fiecare leaderboard = seq scan.
    - `parentStudentLinks(tenantId, parentUserId)` + `(tenantId, studentId)` — 2-3 seq scans la fiecare load de app părinte.
    - `directMessages` — zero indexuri pe thread/sentAt.

13. **N+1-uri confirmate**:
    - `analytics.ts:301-357` — 3 queries × N branches (10 branches = 31 round-trips). `branchReports.ts` are deja pattern-ul corect (`GROUP BY branchId`) — copiază-l.
    - `lessons.ts:436-469` — până la 600 queries seriale per batch check-in. → `SELECT` + bulk `INSERT ON CONFLICT`.
    - `mobile.ts:766` leaderboard — un `SUM` per student, fără cap. → `GROUP BY studentId IN (...)`.

14. **Endpoint-uri liste nepaginate** — `GET /api/payments|lessons|invoices` întorc toate rândurile (1.400 studenți × 12 luni = 16k+ rânduri/request). → `limit`/`offset`, default 100.

15. **`LIKE '%planId%'` în payment plan progress** (`paymentPlans.ts:135`) — planurile-s embeddate în `notes`, nu există FK `plan_id`. → migrare: `invoices.plan_id uuid REFERENCES payment_plans(id)`.

16. **Tipuri/constrângeri DB**: `invoices.paidOnline` e `varchar(5)` în loc de `boolean`; indexuri fără prefix `tenantId` (`incidentReports.status`, `immunizationRecords.nextDueDate` — inutile multi-tenant); FK lipsă `leads.branchId`/`teachers.branchId`; `sellerProfiles.tenantId` ar trebui `uniqueIndex`.

---

## P2 — Datorie arhitecturală (sisteme concurente)

17. **Două sisteme de notificări** — `services/notifications/NotificationService.ts` (real) vs `lib/notificationService.ts` (stub no-op) cu **semnături identice**, plus 4 tabele + 3 rute. Riscă exact incidentul „două sisteme" din trecut. → Șterge stub-ul, redenumește, consolidează.

18. **Două sisteme de audit-log** — `schema/audit.ts` + `auditLog.ts`, 3 rute, `lib/auditLogger.ts`. → Consolidează pe unul.

19. **Fără service layer** — 89 rute cu DB+business+validare inline, reuse prin copy-paste. → Extrage `server/services/` pentru domeniile grele (payments, leads).

20. **103 `.execute().rows` brute** + 3 helpere `normalizeRows` duplicate. → Un singur helper partajat; preferă query builder.

21. **Scoping tenant hand-written în 91 fișiere** — o omisiune = leak cross-tenant. → Guard/helper central.

---

## P3 — Igienă cod & securitate minoră

22. **18 erori lint** (15× `require()` interzis + `prefer-const`, empty-interface). Mecanice, blochează „lint green" din §9. → `npm run lint --fix` + manual.
23. **184 warnings**, 131 importuri moarte (`--fix` curăță majoritatea).
24. **`formatCurrency` duplicat în 16 fișiere** deși `formatCents` există în `src/lib/utils.ts` — riscă drift de monedă/locale pentru sumele arătate părinților.
25. **Endpoint demo-password în prod** (`auth.ts:391`) — resetează parole la `demo123456` și o întoarce. → strip la build prod.
26. **Fără security headers / CSP** (`app.ts`) — adaugă `secureHeaders()`. **CORS** cu fallback hardcodat `localhost:5173` credentialed în prod.
27. **`onError` întoarce `err.message` raw** + health endpoints leak text DB pre-auth. → mesaj generic + request id.
28. **Teste server subțiri** — 96 rute vs 5 fișiere de test; 80/195 teste front-end sunt render-only. → integration tests live-Hono pe auth/payments/invoices/leads.
29. **CSV/formula injection** în export-uri (`auditLog.ts`); session TTL 30d fără rotație; email enumeration la signup; `x-forwarded-for` de încredere pentru IP-ul de consimțământ GDPR.

---

## Recomandare de secvențiere

**Făcut deja (2026-06-02):** F1 (breakpoints migrări), F2 (drift `0109`), F3 (api-keys/webhooks montate). Acestea erau prod-safety — restul Sprint 1 rămâne.
**Sprint 1 (prod-safety):** #1 (restul ~39 rute + gate CI), #1b/#1c-rezidual (gate-uri CI migrare/drift), #2, #3, #4 — oprește ruperea silentă și frauda.
**Sprint 2 (authZ + UX):** #5, #6, #8 (ErrorBoundary), #9, #10, #11.
**Sprint 3 (scalare):** #7 (bundle split), #12 (indexuri), #13–15 (N+1 + paginare).
**Continuu:** #17–21 (consolidare sisteme), #22–29 (igienă) — pe măsură ce atingi fișierele.

**Cel mai bun raport efort/valoare:** gate-ul CI „rută Hono ⇒ montată în app.ts" (#1) — o singură verificare ar fi prins toate cele 41 de orfane și previne recidiva.
