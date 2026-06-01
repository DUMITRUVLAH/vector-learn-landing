# Technical Requirements — Form Builder (Typeform-style) → CRM Lead Collection

Date: 2026-06-01. Goal: a Typeform-style form builder where a school/center designs a public
form (lead-collection, registration, surveys), shares/embeds it, and **submissions create leads
in the CRM** — with UTM attribution, conditional logic, and analytics.

## 1. Context analysis

### Typeform (the reference)
- **One-question-at-a-time UI** — the core differentiator; ~3.5x completion vs standard forms.
- **25+ field types**: short/long text, email, phone, number, multiple choice, dropdown, picture
  choice, rating, NPS, ranking, date, file upload, yes/no, legal/consent, payment.
- **Conditional logic / jump branching** — "if answer X → jump to question Y / end".
- **Hidden fields** — capture UTM/attribution from URL params (`?utm_source=...&ref=...`).
- **Calculation/score** fields (quizzes, pricing). **Partial submit** (capture incomplete).
- **Embed** (inline / popup / fullpage) + **webhooks** + 120+ integrations.
- **Thank-you screen**, redirect, multiple endings.

### What WE already have (verified — reuse, don't rebuild)
- **`/api/leads/intake`** (public, no-auth, with dedup by phone/email) — but FIXED fields only.
  This is the lead-creation sink we route submissions into.
- **FEEDBACK-601** — `feedback_forms` + `feedback_questions` (typed, ordered `position`) +
  `FeedbackPublicPage` (renders questions, collects answers, required-validation, thank-you).
  This is ~60% of a form engine already: dynamic typed questions + a public renderer.
- Tenant model, notifications, CRM pipeline, contracts e-signature pattern.

### The gap (what Typeform has, we don't)
1. A **visual form builder** (drag/reorder questions, configure each field) — feedback forms are
   admin-created but not a rich builder.
2. **Rich field types** beyond feedback's set (picture choice, file upload, dropdown, consent, hidden).
3. **One-question-at-a-time** conversational UI (feedback renders all at once).
4. **Conditional logic / jump branching.**
5. **Field → lead mapping** (which form field fills lead.fullName / phone / email / interestCourse /
   custom field / tag) so submissions become proper CRM leads, not just stored answers.
6. **Hidden fields / UTM capture**, **embed snippet**, **per-form analytics** (views, starts,
   completions, completion rate, conversion to lead).

## 2. Architecture decision

**Build a new `forms` module, but reuse the FEEDBACK-601 question-type foundation and the
`/api/leads/intake` dedup logic.** Do NOT fork feedback — generalize. A "form" is a superset of a
"feedback form" with: field→lead mapping, logic, hidden fields, public conversational renderer,
analytics. Submissions with a lead-mapping create/update a CRM lead via the existing intake path
(same dedup, same `source='form:<slug>'`, same UTM capture).

## 3. Data model (new `server/db/schema/forms.ts`)
- `forms`: id, tenantId, title, slug (public URL), status(draft/published/closed), description,
  thankYouMessage, redirectUrl, theme jsonb, createdBy, timestamps.
- `form_fields`: id, tenantId, formId(FK cascade), type(enum), label, placeholder, required bool,
  position int, options jsonb (for choice/dropdown/picture), `leadMapping varchar null`
  (one of: fullName|phone|email|interestCourse|tag|custom:<key>|none), `hidden bool`,
  `hiddenSourceParam varchar null` (URL param name for hidden fields), validation jsonb.
- `form_logic`: id, tenantId, formId, fromFieldId, condition jsonb (e.g. {op:'equals',value:'X'}),
  action enum(jump_to_field|jump_to_end), targetFieldId null.
- `form_submissions`: id, tenantId, formId, answers jsonb, leadId(FK null — the created lead),
  utm jsonb, status(partial|complete), submittedAt, ip null.
- `form_views`: id, tenantId, formId, viewedAt (for analytics; or aggregate counter on forms).
- Enums wrapped in `DO $$ ... duplicate_object` guards (repo rule).

## 4. API
- **Admin (auth)**: `GET/POST /api/forms`, `PATCH/DELETE /api/forms/:id`, `POST /api/forms/:id/fields`
  (+ patch/delete/reorder), `POST /api/forms/:id/logic`, `GET /api/forms/:id/analytics`,
  `GET /api/forms/:id/submissions`, `POST /api/forms/:id/publish`.
- **Public (NO auth, like intake)**: `GET /api/public/forms/:slug` (returns published form+fields,
  404 if draft/closed), `POST /api/public/forms/:slug/submit` (validates required, applies
  field→lead mapping → creates/updates lead via existing intake/dedup, stores submission, captures
  UTM/hidden), `POST /api/public/forms/:slug/view` (analytics ping), `POST .../partial` (partial save).
- Reuse `normalizePhone`/`normalizeEmail`/dedup from leads route.

## 5. Frontend
- **Builder** `/app/forms` + `/app/forms/:id/edit`: list forms; editor with field palette, reorderable
  field list, per-field config panel (type, label, required, options, **lead mapping dropdown**,
  hidden+param), logic editor, publish toggle, share/embed snippet, live preview.
- **Public renderer** `/f/:slug` (no auth): **one-question-at-a-time** conversational flow
  (progress bar, Enter-to-advance, back), honors logic/branching, captures `?utm_*`/hidden params
  from URL, thank-you screen / redirect. Vector 365, dark-mode, mobile-first, accessible.
- **Embed**: `<script>` snippet (inline iframe / popup) generated per form.
- **Analytics tab** per form: views, starts, completions, completion-rate %, leads created.

## 6. Out of scope (later phases)
Payment fields (depends on PAY-901 Stripe), calculation/quiz scoring, file upload to storage,
video questions, A/B testing, 120+ third-party integrations (webhook out is in scope minimal).

## 7. Constraints / repo rules
- Tenant-safe everywhere; public endpoints rate-limit-aware, no tenant leak.
- Migrations hand-crafted, idempotent enum guards, prefix > current max, verified on real Postgres.
- Client list limits ≤ 100. Romanian copy, Vector 365 tokens, dark-mode, zero `any`.
- Field→lead mapping MUST go through the existing dedup path (no duplicate leads).

Sources: typeform.com feature pages, formbuilder.tools/typeform, makeforms.io/blog/best-typeform-competitors.
