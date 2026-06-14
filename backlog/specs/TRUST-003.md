---
id: TRUST-003
title: "Export GDPR date personale + retenție automată + UI setări securitate"
milestone: FIN
phase: "16"
status: pending
depends_on: [TRUST-001, TRUST-002]
spec: backlog/specs/TRUST-003.md
branch: feat/FIN-trust
---

## Goal

Completează faza TRUST (FIN-CORE §1.16): adaugă dreptul la portabilitate GDPR (export JSON
al tuturor datelor unui elev/persoană la cerere), un job de retenție automată (date
anonimizate după N zile conform politicii tenantului), și o pagină `/app/fin/settings/security`
care reunește toate controalele de securitate FinDesk: pseudonimizare AI, retenție, AI opt-in
și un buton de export GDPR.

Reuse: `finDataSettings` (TRUST-001), `piiAnonymizer` (TRUST-001), `consent` schema (CONSENT-001),
`aiAuditLog` (AI-A01). Crypto: `server/lib/crypto.ts` (AES-256-GCM). Nu crea tabele noi.

---

## User stories

- Ca **director**, vreau să export toate datele unui elev în format JSON (GDPR Art. 20 —
  portabilitate), pentru că dacă un tutore cere, trebuie să răspund în 30 zile.
- Ca **sistem**, vreau ca datele personale ale elevilor care au ieșit din evidență de mai mult
  de N zile să fie anonimizate automat, pentru că GDPR art. 5(1)(e) impune limitarea stocării.
- Ca **director**, vreau o singură pagină de setări securitate care reunește pseudonimizare AI,
  retenție date și AI opt-in, pentru că nu vreau să caut prin mai multe meniuri.

---

## Acceptance criteria

- [ ] AC1: `GET /api/fin/gdpr/export/:studentId` — returnează un JSON cu datele personale ale
  elevului: profil (name, email, phone, dateOfBirth), consimțăminte (consent_requests),
  log AI (ai_audit_log, ultimele 100). Accesat doar de admin/finance. Header:
  `Content-Disposition: attachment; filename="gdpr-export-<id>.json"`.
  Tenant-izat. Fără raw `.execute().rows`.

- [ ] AC2: `POST /api/fin/gdpr/anonymize-old` — anonimizează (NULL) câmpurile PII
  (name→"[GDPR_REMOVED]", email→null, phone→null, dateOfBirth→null) din `students` unde
  `updated_at < NOW() - retention_days_students zile`. Adaugă câmpul `retention_days_students`
  (INTEGER DEFAULT 1825 — 5 ani) în `fin_data_settings`. Returnează `{ anonymized: N }`.
  Accesibil doar admin.

- [ ] AC3: Migration `0125_fin_data_settings_retention.sql` — adaugă coloana `retention_days_students INTEGER DEFAULT 1825`
  în tabelul `fin_data_settings`. Prefix 0125, commit în același PR cu TRUST-003.
  `db:reset && db:seed` trec.

- [ ] AC4: Pagina `/app/fin/settings/security` — `FinSecuritySettingsPage`:
  - Card „Pseudonimizare AI": toggle pseudonymize_ai_prompts (PATCH /api/fin/data-settings).
  - Card „Retenție AI log": input numeric ai_log_retention_days (30–365 zile).
  - Card „Retenție date elevi": input numeric retention_days_students (365–3650 zile).
  - Card „AI Opt-In": toggle ai_opt_in cu mesaj de avertisment.
  - Buton „Export GDPR" → dialog cu input student ID → download JSON.
  - Buton „Anonimizare elevi inactivi" cu confirmare → afișează `N elevi anonimizați`.
  - Save PATCH-uiește fin_data_settings la submit. Toast de confirmare.
  - Design system tokens only, dark mode, WCAG AA.

- [ ] AC5: Link `/app/fin/settings/security` adăugat în sidebar FinDesk (sau în pagina
  settings existentă alături de linkul „Audit AI" din TRUST-002). Ruta în App.tsx/router.

- [ ] AC6: Tests: export GDPR returnează structura corectă (mock), anonymize-old calculează
  corect data, `FinSecuritySettingsPage` se renderizează fără crash, toggle pseudonimizare
  PATCH-uiește ruta corectă (mock fetch).

---

## Files

### New
- `server/routes/finGdpr.ts` — GET /api/fin/gdpr/export/:studentId + POST /api/fin/gdpr/anonymize-old
- `src/pages/fin/FinSecuritySettingsPage.tsx` — pagina de setări securitate
- `src/__tests__/fin/fin-gdpr.test.ts`
- `drizzle/0125_fin_data_settings_retention.sql`

### Modified
- `drizzle/meta/_journal.json` — append entry idx=125
- `server/db/schema/finDataSettings.ts` — adaugă `retentionDaysStudents` field
- `server/app.ts` — mount finGdprRoutes pe `/api/fin/gdpr`
- `src/App.tsx` (sau router fin) — ruta `/app/fin/settings/security`

---

## Tests

- **T-TRUST-003-1** [blocant] Given server running + student existent, When `GET /api/fin/gdpr/export/:id`, Then 200 JSON cu câmpurile `profile`, `consents`, `aiLog` plus header Content-Disposition
- **T-TRUST-003-2** [blocant] Given migration 0125 aplicată, When `npm run db:reset && npm run db:seed`, Then succes (nicio eroare)
- **T-TRUST-003-3** [blocant] Given `FinSecuritySettingsPage` render cu mock API, When montare, Then nu crează crash + afișează 4 carduri
- **T-TRUST-003-4** [normal] Given `POST /api/fin/gdpr/anonymize-old`, When executat, Then returnează `{ anonymized: N }` și studenți vechi au name="[GDPR_REMOVED]"
- **T-TRUST-003-5** [normal] Given toggle pseudonymize_ai_prompts în UI, When submit, Then PATCH /api/fin/data-settings trimis cu noul valor
- **T-TRUST-003-6** [normal] Given ruta `/app/fin/settings/security` în router, When navigare, Then FinSecuritySettingsPage se montează

---

## Definition of Done

- [ ] Toate AC-urile trecute
- [ ] Toate T-urile [blocant] verzi
- [ ] Build + typecheck + lint verde
- [ ] Migration 0125 committă + db:reset green
- [ ] Route mount confirmat în server/app.ts
- [ ] Schema index: finDataSettings.ts actualizat (coloana nouă); deja exportat din index.ts
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
- [ ] TRUST phase (16) COMPLETĂ — FIN-CORE §1.16 acoperit integral
