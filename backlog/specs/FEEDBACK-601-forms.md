---
id: FEEDBACK-601
title: "Formulare de feedback — trimitere la elevi/părinți + analiza răspunsurilor"
milestone: FEEDBACK
phase: 1
priority: P1
slug: forms
depends_on: [MVP-004, CRM-111]
status: pending
---

# FEEDBACK-601 — Formulare de feedback (din student card)

## Goal

Academia trimite formulare de feedback elevilor și părinților (NPS + text liber + note cu stele)
după prima săptămână, la mijloc și la finalul cursului. Răspunsurile sunt anonime sau nominale,
centralizate în dashboard cu scor mediu + răspunsuri text. Manager-ul poate lansa un formular
direct din cartonașul studentului.

## In scope

- **Tabelele noi:** `feedback_forms`, `feedback_questions`, `feedback_invitations`, `feedback_answers`
  (detalii în schema de mai jos). Tenant-scoped.
- **Form builder simplu** (`/app/feedback/new`): titlu + descriere + 1–20 întrebări.
  Tipuri de întrebări: `rating` (1–5 stele), `nps` (0–10), `text` (text liber), `yesno`.
- **Send feedback request** — buton pe cartonașul studentului (`/app/students`) → deschide un modal
  de selectare formular + trimite invitație (generează token unic pentru student).
- **Endpoint public no-auth** `GET /api/feedback/public/:token` → formularul de completat.
  `POST /api/feedback/public/:token/submit` → salvează răspunsurile. Nu necesită login.
- **Dashboard** `/app/feedback` — lista formularelor cu scor mediu + nr răspunsuri + rata de răspuns.
  Click pe un formular → lista invitațiilor + răspunsuri text individuale.
- **Endpoints autentificate (tenant-scoped):**
  - `GET /api/feedback` — lista formularelor
  - `POST /api/feedback` — creează formular cu întrebări
  - `GET /api/feedback/:id` — detalii formular + statistici agregate
  - `POST /api/feedback/:formId/send` — body: `{ studentId }` — creează invitație + returnează link
  - `GET /api/feedback/:formId/responses` — toate răspunsurile (tenant-scoped)
- Număr contract auto-generat pentru invitații: token UUID (nu contract number)
- No-auth submit path: fără auth, cu token în URL, CORS wildcard pe endpoint public
- **DB:** fără raw `.execute().rows`; query builder cu wrapper de portabilitate

## Out of scope

- Trimitere automată via email/WhatsApp (linkul se copiază manual de pe cartonașul studentului)
- Template-uri multiple predefinite (creat manual de manager)
- Rapoarte avansate (trends, cohort analysis)
- Semnătură electronică

## Acceptance criteria

- [ ] Pagina `/app/feedback` lista formularelor cu scor mediu + nr răspunsuri
- [ ] Buton „Trimite feedback" pe rândul studentului din StudentsPage → modal cu selectare formular → generează link invitație
- [ ] Pagina publică `/feedback/:token` (no-auth) — randează formularul + submit → salvează răspunsurile
- [ ] `POST /api/feedback/public/:token/submit` → 200 (sau 409 dacă deja completat)
- [ ] `GET /api/feedback/:id` returnează scor mediu calculat din `feedback_answers`
- [ ] Migrare `feedback_*` tables commitată; `db:reset + db:seed` succed
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK; mobil-friendly
- [ ] TypeScript strict; zero `any`

## Tests

- **T-FEEDBACK-601-1** `[blocant]` Given token valid, When `GET /api/feedback/public/:token`, Then 200 cu form și întrebări
- **T-FEEDBACK-601-2** `[blocant]` Given token valid, When `POST /api/feedback/public/:token/submit` cu răspunsuri valide, Then 200 + `feedback_answers` salvate
- **T-FEEDBACK-601-3** `[blocant]` Given token deja submittat, When `POST /api/feedback/public/:token/submit` din nou, Then 409
- **T-FEEDBACK-601-4** `[blocant]` Given formular cu 3 rating-uri (3, 4, 5), When `GET /api/feedback/:id`, Then `averageScore ≈ 4.0`
- **T-FEEDBACK-601-5** `[blocant]` Migration gate: `db:reset + db:seed` succed
- **T-FEEDBACK-601-6** `[blocant]` Multi-tenant: răspunsurile unui tenant nu sunt vizibile altui tenant
- **T-FEEDBACK-601-7** `[normal]` Given buton „Trimite feedback" pe student, When click, Then modal cu lista formularelor apare
- **T-FEEDBACK-601-8** `[normal]` Pagina publică `/feedback/:token` randează fără crash cu token valid

## DoD

Standard. O fază = 1 PR (CLAUDE.md §0.2).
