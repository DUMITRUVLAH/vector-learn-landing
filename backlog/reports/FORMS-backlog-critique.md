# Backlog Critique — FORMS milestone (Typeform-style form builder → CRM lead collection)

Date: 2026-06-01. Reviewer: backlog-critic. Reviewed before any FORMS item is built.
Context read: `FORMS-001` full spec, `REQ-FORMS-typeform-lead-collection-2026-06-01.md`,
`STATE.json` (FORMS-001..005), `BACKLOG.md` FORMS rows, and the reused code:
`server/routes/leads.ts` (`/intake` dedup), `server/lib/normalize.ts`,
`server/db/schema/leads.ts` + `leadTags`, `server/db/schema/feedback.ts`,
`server/routes/feedback.ts`, `server/routes/feedbackPublic.ts`,
`src/pages/app/FeedbackPublicPage.tsx`, `server/app.ts` (route mount order),
`drizzle/` (latest migration prefix).

---

## Per-item verdict

### FORMS-001 — Form engine + field→lead mapping + public submit (dedup) — **IMPROVE** (applied)
Earns its place: it is the foundation owner explicitly asked for ("leadurile să intre din formular").
One-PR-sized for a phase. But the first draft had **one correctness bug that would 500 on prod** plus
several incompletenesses. Fixes applied directly to the spec:

1. **CRITICAL — invalid enum value (blocking, would break prod).** The spec set the new lead's
   `source = 'form:<slug>'`. `leads.source` is a **fixed Postgres enum** (`leadSourceEnum`:
   `webform|manual|facebook_ad|google_ads|referral|phone_in|instagram|import|other` —
   `server/db/schema/leads.ts:14-24`). Inserting `'form:<slug>'` violates the enum and throws on
   Postgres (exactly the "compiles on PGlite, 500 on Supabase" class from CLAUDE.md §3.5.1).
   **Applied:** `source='webform'` (valid enum), origin traced via `utmSource='form:<slug>'`
   (free varchar) + a `system` `leadInteraction` naming the slug — mirroring the `/intake` pattern
   at `leads.ts:179-220`. Updated Goal "Reuse" block, In-scope submit steps, AC3, and T-FORMS-001-3
   (now asserts `source` stays a valid enum value).

2. **Tags were mapped but never persisted.** `mapAnswersToLead` returns `tags[]`, but the submit
   flow only created/updated the lead — `leads` has **no tags column**; tags live in the separate
   `lead_tags` table (`leads.ts:154`, written via `onConflictDoNothing` in `/import`).
   **Applied:** added submit step 3 + AC7 + blocking test T-FORMS-001-8 to insert tags into
   `lead_tags`.

3. **No GDPR basis on form-created leads.** `/intake` writes `consentText/consentAt/ipAtConsent`;
   the form path created leads with no legal basis (the schema even has a `consent` field type but
   nothing consumed it). **Applied:** submit step 5 + AC8 + test T-FORMS-001-11 to populate consent
   from a checked `consent` field.

4. **Dedup only specified for email.** **Applied:** added T-FORMS-001-4b (dedup by `phoneNormalized`)
   so both branches of the existing dedup are gated.

5. **Tenant-isolation not gated.** Public-endpoint + admin module → must prove a tenant can't read
   another tenant's form/submissions. **Applied:** AC9 + blocking test T-FORMS-001-9.

6. **Idempotency claimed but not tested.** **Applied:** T-FORMS-001-10 runs `db:reset && db:seed`
   twice to actually prove the `DO $$ ... duplicate_object` guards work (the repo's recurring
   migration-collision class — latest prefix is `0032`, so FORMS migration must be `0033+`).

7. **Mount order made explicit.** Clarified to mirror the verified pattern: public route mounted at
   `/api/public/forms` **before** `tagRoutes` (which installs the global `requireAuth` at `/api`,
   `app.ts:107`), admin route at `/api/forms` with its own `requireAuth` — same as
   `feedbackPublicRoutes`/`feedbackRoutes` (`app.ts:105-106`).

8. **Dependency fix (STATE.json).** Spec frontmatter said `depends_on: [CRM-101]` but
   `STATE.json` had `depends_on: []`. CRM-101 (intake-web, the dedup source) is `done`.
   **Applied:** set STATE.json FORMS-001 `depends_on` to `["CRM-101"]` to match the spec and
   record the real reuse dependency.

Reuse verified as genuine, not a fork: the spec now explicitly references reusing
`normalizePhone`/`normalizeEmail`, the `/intake` dedup query, the `lead_tags` insert pattern, and
the FEEDBACK-601 typed-question + public-renderer patterns as the template to *generalize* (the REQ
doc's architecture decision is correct — FORMS is a superset of feedback, not a parallel build).

### FORMS-002 — Visual builder (reorderable fields, per-field config, lead-mapping, publish/share) — **KEEP**
Correctly depends on FORMS-001. One-PR-sized as a phase deliverable. No individual spec yet (points
to REQ doc) — acceptable for a phased build, but see recommendation below. The REQ doc's field
palette + per-field config + lead-mapping dropdown + live preview is the right scope; reuse the
feedback form-builder admin UI patterns rather than starting blank.

### FORMS-003 — Public conversational renderer `/f/:slug` (one-question-at-a-time) — **KEEP**
This is Typeform's actual differentiator (~3.5x completion) and the highest user-facing value item.
Correctly depends on FORMS-001 only. Reuse the `AnswerInput` field components from
`FeedbackPublicPage.tsx` (rating/nps/yesno/text already exist) and extend for the new types — the
spec (when written) must say so to avoid a rebuild. Must read `?utm_*`/hidden params from the URL and
pass them to the submit endpoint built in FORMS-001 (the wiring contract already exists).

### FORMS-004 — Conditional logic / jump branching — **KEEP**
Correctly depends on `[FORMS-002, FORMS-003]` (needs both the builder to author rules and the
renderer to honor them). `normal` severity is right — it's an enhancement, not core to "leads enter
from a form". Note: the `form_logic` table is **deferred out of FORMS-001's schema** (correctly), so
FORMS-004 must ship its own migration for it (prefix-aware, enum guards).

### FORMS-005 — Embed snippet + per-form analytics — **KEEP** (one dependency note)
Correctly depends on `[FORMS-003]`. Reasonable as the last, `normal`-severity item. **Gap to close in
its spec:** analytics (views/starts/completions/conversion) needs the `form_views` table (or counter
columns), which FORMS-001 **deliberately deferred**. FORMS-005's spec must add that table/migration
and the `POST /api/public/forms/:slug/view` ping; otherwise "completion rate" has no denominator.
Recorded as a recommendation (no spec exists to edit yet).

---

## Recommendations (not auto-applied — no individual specs exist yet for 002–005)
- Before building FORMS-002..005, write individual specs (`backlog/specs/FORMS-00X-*.md`) instead of
  pointing five items at one REQ doc. Each needs its own testable AC + blocking tests (migration +
  live-API smoke). The phased build groups them into one PR, but per-item specs are what stop a
  builder from diverging mid-phase (CLAUDE.md §0.2). This is process, not a product change, so left
  as a recommendation.
- FORMS-003 & FORMS-002 specs should name the exact FEEDBACK-601 components to reuse
  (`AnswerInput`, the question-CRUD shapes) so reuse is enforced, not hoped for.
- FORMS-005 spec must include the `form_views`/counter migration that FORMS-001 deferred.

## Product-level
This batch does the most important thing right: it does **not** fork the feedback engine — it
generalizes it, and it routes submissions through the *existing* lead dedup path so a form submit
becomes a real, de-duplicated CRM lead with UTM attribution. That is the whole point ("leadurile să
intre din formular"), and FORMS-001 is now a sound, prod-safe foundation after the fixes. **The single
biggest risk** was the `source='form:<slug>'` enum violation — a clean local build that 500s the
moment it hits Supabase, the exact failure CLAUDE.md §3.5.1 exists to prevent; it is now fixed in the
spec + gated by a test. **The one improvement that would most move the product** is FORMS-003's
one-question-at-a-time conversational renderer: it is the difference between "another web form" and
"the Typeform-class completion rate" that makes more leads actually arrive — prioritize its UX and
mobile polish over FORMS-004/005.
