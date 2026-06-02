---
id: FORMS-001
title: "Forms: motor de formulare (schema + câmpuri tipizate + mapare câmp→lead + submit public cu dedup)"
milestone: FORMS
phase: 1
status: pending
depends_on: [CRM-101]
slug: form-engine-lead-mapping
---

## Goal

Fundația unui constructor de formulare gen Typeform prin care **submisiile creează leaduri în CRM**.
Această fază aduce **schema + API-ul** (admin CRUD + submit public), NU builder-ul vizual (FORMS-002)
și nici UI-ul conversațional (FORMS-003). Reutilizează: logica de dedup din `/api/leads/intake`
(`normalizePhone`/`normalizeEmail`) și pattern-ul de tipuri-întrebări din FEEDBACK-601.

Cheia acestei faze: **maparea câmp→lead** — fiecare câmp de formular poate fi mapat la un câmp de
lead (fullName/phone/email/interestCourse/tag/custom), astfel încât un submit public devine un lead
real în pipeline, cu dedup și atribuire UTM — exact ce cere owner-ul („leadurile să intre din formular").

**Reuse obligatoriu (nu reinventa):**
- Dedup + insert lead: refolosește pattern-ul exact din `server/routes/leads.ts` `/intake`
  (`normalizePhone`/`normalizeEmail` din `server/lib/normalize.ts`, query pe
  `phoneNormalized`/`emailNormalized`, `leadInteractions` system). NU rescrie logica de dedup.
- `lead_source` este enum Postgres FIX (`webform|manual|facebook_ad|google_ads|referral|phone_in|
  instagram|import|other`). Submit-ul folosește `source='webform'`; NU adăuga o valoare nouă în enum
  și NU insera `'form:<slug>'` în coloana `source` (ar da 500 pe Postgres). Slug-ul se trasează în
  `utmSource` + interacțiune.
- Tag-urile merg în tabela `lead_tags` (varchar, `onConflictDoNothing`), nu pe rândul lead.
- Renderer-ul public și CRUD-ul de întrebări tipizate din FEEDBACK-601 (`feedback.ts`,
  `feedbackPublic.ts`, `FeedbackPublicPage.tsx`) sunt referința de pattern; FORMS generalizează,
  NU forkează feedback.

## In scope

### Schema `server/db/schema/forms.ts`
- enum `form_field_type`: `short_text, long_text, email, phone, number, single_choice,
  multiple_choice, dropdown, rating, yes_no, date, consent, hidden` — în guard `DO $$ ... duplicate_object`.
- enum `form_status`: `draft, published, closed` — în guard.
- enum `form_submission_status`: `partial, complete` — în guard.
- `forms`: id, tenantId(FK cascade), title, slug(unic per tenant), status(default draft),
  description null, thankYouMessage null, redirectUrl null, createdBy null, timestamps.
- `form_fields`: id, tenantId, formId(FK cascade), type(enum), label, placeholder null,
  required bool default false, position int, options jsonb null (string[] pt choice/dropdown),
  leadMapping varchar null (`fullName|phone|email|interestCourse|tag|none`),
  hidden bool default false, hiddenSourceParam varchar null. Index `(tenantId, formId)`.
- `form_submissions`: id, tenantId, formId(FK cascade), answers jsonb, leadId uuid null (FK→leads set null),
  utm jsonb null, status(enum default complete), ip varchar null, submittedAt timestamp default now.
- Export în `server/db/schema/index.ts`.

### `server/lib/formMapping.ts` (pur, testat)
- `mapAnswersToLead(fields, answers)` → `{ fullName?, phone?, email?, interestCourse?, tags[] }`
  pe baza `leadMapping` al fiecărui câmp. Câmpurile `tag` se adună în `tags[]`.
- `validateRequired(fields, answers)` → listă de fieldId-uri lipsă (pentru 400).

### `server/routes/forms.ts` (admin, auth)
- `GET/POST /api/forms`, `PATCH/DELETE /api/forms/:id` (tenant-safe).
- `POST /api/forms/:id/fields`, `PATCH/DELETE /api/forms/:id/fields/:fieldId`,
  `PUT /api/forms/:id/fields/reorder` (body: ordered ids).
- `GET /api/forms/:id/submissions`.
- `POST /api/forms/:id/publish` (status→published; 400 dacă 0 câmpuri).

### `server/routes/publicForms.ts` (NO AUTH — montat ca feedbackPublic, înainte de requireAuth global)
- `GET /api/public/forms/:slug` → formularul published + câmpuri (NU câmpuri hidden în payload-ul
  vizibil, dar le include cu flag). 404 dacă draft/closed/inexistent.
- `POST /api/public/forms/:slug/submit` body `{answers, utm?, hidden?}`:
  1. validează required (`validateRequired`) → 400 `missing_required` + listă.
  2. `mapAnswersToLead` → dacă rezultă măcar phone SAU email, creează/actualizează lead prin
     ACELAȘI dedup ca intake (tenant + phone/email pe `phoneNormalized`/`emailNormalized`),
     `source = 'webform'` (valoare EXISTENTĂ în `lead_source` enum — NU se inventează valoarea
     `'form:<slug>'`, care ar viola enum-ul Postgres și ar da 500 pe prod). Originea formularului
     se trasează prin `utmSource = 'form:<slug>'` (varchar liber) ȘI printr-o `leadInteraction`
     de tip `system` cu body „Lead creat din formular: <slug>" — exact pattern-ul intake-ului
     (`server/routes/leads.ts` liniile 179-220). Salvează utm pe lead (`utmSource/Medium/Campaign`).
  3. dacă maparea produce tag-uri (`tags[]`), inserează-le în tabela `lead_tags`
     (`onConflictDoNothing`, ca în `/import`) — NU pe rândul lead (leads NU are coloană tags).
  4. la dedup-hit (lead existent), adaugă o `leadInteraction` system „Re-submit formular: <slug>"
     și refolosește `leadId`-ul existent (NU crea duplicat).
  5. setează `consentText`/`consentAt`/`ipAtConsent` pe lead când există un câmp de tip `consent`
     bifat (GDPR — leadul are nevoie de o bază legală, la fel ca intake-ul).
  6. salvează `form_submissions` (answers + leadId + utm + ip).
  7. răspunde `{ ok: true, leadCreated: bool, leadId }`.
- Înregistrare ambele rute în `server/app.ts`: `app.route("/api/public/forms", publicFormRoutes)`
  ÎNAINTE de `tagRoutes` (care montează `requireAuth` global la `/api`) — exact ca
  `feedbackPublicRoutes` la linia 105. Rutele admin `formRoutes` montate la `/api/forms` cu
  `requireAuth` propriu (ca `feedbackRoutes`).

### Migrare
- Hand-crafted, prefix > maxul curent, enum-uri în guard `DO $$`, verificat pe Postgres real.

## Out of scope
- Builder vizual drag/drop → FORMS-002
- UI conversațional one-question-at-a-time → FORMS-003
- Logică condițională / branching → FORMS-004
- Embed snippet + analytics → FORMS-005
- File upload, payment, calculation fields → fază viitoare

## User stories
- Ca **manager de centru**, vreau să creez un formular cu câmpurile mele (nume, telefon, curs dorit),
  pentru că vreau să colectez leaduri printr-un link public, nu doar prin formularul fix de intake.
- Ca **manager**, vreau să mapez fiecare câmp la un câmp de lead, pentru că vreau ca submisiile să
  ajungă direct în pipeline-ul CRM ca leaduri reale, cu dedup.
- Ca **vizitator** (potențial client), vreau să completez formularul public fără cont, pentru că
  vreau să-mi exprim interesul rapid.
- Ca **manager**, vreau ca atribuirea UTM să fie păstrată, pentru că vreau să știu din ce campanie
  a venit lead-ul.

## Acceptance criteria
- AC1: Pot crea un formular (draft) și adăuga câmpuri tipizate cu poziție.
- AC2: Un formular draft NU e accesibil public (`GET /api/public/forms/:slug` → 404); după publish → 200.
- AC3: Un submit public cu câmp mapat la `phone`/`email` creează un lead în CRM cu
  `source='webform'` (enum valid) și `utmSource='form:<slug>'` ca trasare a originii; se scrie și
  o `leadInteraction` system care numește slug-ul formularului.
- AC4: Un al doilea submit cu același telefon/email NU creează lead duplicat (dedup pe
  `phoneNormalized`/`emailNormalized`, ca la intake) — același `leadId` returnat.
- AC5: Submit fără câmpurile required completate → 400 `missing_required` + lista fieldId-urilor.
- AC6: UTM-ul trimis e salvat pe submission ȘI pe lead (`utmSource/Medium/Campaign`).
- AC7: Tag-urile rezultate din maparea câmpurilor ajung în `lead_tags` (nu se pierd, nu duplică).
- AC8: Un câmp `consent` bifat populează `consentText/consentAt/ipAtConsent` pe lead (bază legală GDPR).
- AC9: Tot e tenant-scoped (forms/fields/submissions filtrate pe `tenantId`; un alt tenant NU vede
  un formular published al altuia pe rutele admin); migrare committed fără collision; idempotentă
  pe Postgres real.

## Tests (Given/When/Then)
- **T-FORMS-001-1** [blocant] Given schema forms.ts, When `db:generate`, Then NU rămâne migrare
  necommitted ȘI prefix > max pe origin/main; enum-urile au guard `DO $$` (idempotent).
- **T-FORMS-001-2** [blocant] Given funcția pură `mapAnswersToLead` cu un câmp mapat la `phone` și unul
  la `tag`, When primește answers, Then întoarce `{phone, tags:[...]}` corect (unit, fără DB).
- **T-FORMS-001-3** [blocant] Given un formular published cu câmp mapat la email, When `POST
  /api/public/forms/:slug/submit`, Then 200 + un lead nou cu `source='webform'` ȘI
  `utmSource='form:<slug>'` (live API; verifică EXPLICIT că `source` rămâne o valoare validă din
  enum — nu `'form:<slug>'`).
- **T-FORMS-001-4** [blocant] Given un lead existent cu același email, When un al doilea submit,
  Then NU se creează lead duplicat (dedup) — același leadId returnat în răspuns.
- **T-FORMS-001-4b** [blocant] Given dedup pe TELEFON (câmp mapat la `phone`, fără email), When al
  doilea submit cu același telefon normalizat, Then același leadId (dedup pe `phoneNormalized`).
- **T-FORMS-001-5** [blocant] Given un câmp required necompletat, When submit, Then 400
  `missing_required` + lista fieldId-urilor lipsă.
- **T-FORMS-001-6** [normal] Given un formular draft, When `GET /api/public/forms/:slug`, Then 404.
- **T-FORMS-001-7** [blocant] Given serverul pornit, When login + `GET /api/forms`, Then 200 + `items[]`.
- **T-FORMS-001-8** [blocant] Given un câmp mapat la `tag`, When submit creează lead, Then tag-ul
  apare în `lead_tags` pentru acel lead (nu pe rândul lead, fără duplicat la re-submit).
- **T-FORMS-001-9** [blocant] Given un formular published al tenantului A, When tenantul B apelează
  rutele admin `GET /api/forms/:id` / `/submissions`, Then 404 (izolare de tenant; fără leak).
- **T-FORMS-001-10** [blocant] Given migrarea deja aplicată, When `db:reset && db:seed` rulează a
  doua oară (enum-uri în guard `DO $$`), Then succes fără eroare `duplicate_object` (idempotență reală).
- **T-FORMS-001-11** [normal] Given un câmp `consent` bifat, When submit creează lead, Then leadul
  are `consentAt` setat (bază legală GDPR prezentă).

## DoD
Build+typecheck+lint+unit verzi, schema-drift verde, migrare committed fără collision + idempotentă
pe Postgres real, live API smoke (submit public → lead creat), reviewer APPROVED după review→improve,
persona reports salvate, commit pe branch-ul fazei FORMS.
