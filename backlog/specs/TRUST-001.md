---
id: TRUST-001
title: "Schema fin_data_settings + migration + PII anonymization before AI prompts"
milestone: FIN
phase: "16"
status: pending
depends_on: [CORE-001, CAPTURE-002]
spec: backlog/specs/TRUST-001.md
branch: feat/FIN-trust
---

## Goal

Introduce `fin_data_settings` — a per-tenant configuration table that controls
data-handling policies for the FinDesk AI features (pseudonymization, data-retention,
AI opt-in). Build a PII anonymizer that strips/replaces sensitive fields (names, IDNO,
IBAN, email, phone) before any text is sent to the LLM, and expose a settings route
so the owner can review/adjust the policy.

FIN-CORE §1.16: Data Trust & Privacy layer — every AI prompt must be scrubbed of PII
unless the tenant has explicitly opted in (default: scrub everything).

---

## User stories

- Ca **director financiar**, vreau să configurez dacă datele PII sunt anonimizate înainte
  de a fi trimise la AI, pentru că GDPR cere ca datele personale să nu iasă din perimetrul
  controlat fără consimțământ explicit.
- Ca **proprietar tenant**, vreau să setez perioada de retenție a log-urilor AI (30/60/90/365
  de zile), pentru că după expirare datele nu mai sunt necesare și trebuie șterse.
- Ca **auditor**, vreau să văd dacă un prompt AI a fost pseudonimizat, pentru că raportul
  de conformitate GDPR cere această trasabilitate.

---

## Acceptance criteria

- [ ] AC1: Migration `0123_fin_data_settings.sql` creează tabelul `fin_data_settings` cu
  coloanele: `id UUID PK`, `tenant_id UUID FK tenants`, `pseudonymize_ai_prompts BOOLEAN DEFAULT true`,
  `ai_log_retention_days INT DEFAULT 90`, `ai_opt_in BOOLEAN DEFAULT false`,
  `updated_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`. Index unic pe `tenant_id`.

- [ ] AC2: Schema Drizzle `server/db/schema/finDataSettings.ts` — define tabelul cu
  `pgTable`, relație `one(tenants)`, TypeScript types exportate.
  Export adăugat în `server/db/schema/index.ts`.

- [ ] AC3: `server/lib/piiAnonymizer.ts` — funcție `anonymizePii(text: string): string`
  care înlocuiește: emailuri cu `[EMAIL]`, numere de telefon cu `[PHONE]`,
  IBAN-uri (RO[0-9]{2}[A-Z]{4}[0-9]{16}) cu `[IBAN]`, IDNO (13 cifre) cu `[IDNO]`,
  și nume proprii detectate prin pattern (string > 2 cuvinte cu majuscule → `[PERSOANA]`).
  Funcție pură, fără efecte secundare, testabilă în izolare.

- [ ] AC4: `server/routes/finDataSettings.ts` — GET și PATCH `/api/fin/data-settings`:
  - GET: returnează setările curente (upsert cu default-uri dacă nu există);
  - PATCH: actualizează `pseudonymize_ai_prompts`, `ai_log_retention_days` (1–365),
    `ai_opt_in`. Validare Zod. Returnează setările actualizate.
  - Montat în `server/app.ts` la `/api/fin/data-settings`.

- [ ] AC5: Integrare cu AI audit log: coloana `pseudonymized` din `ai_audit_log` se setează
  la valoarea din `fin_data_settings.pseudonymize_ai_prompts` pentru tenant la momentul
  apelului. Nicio schimbare de schemă necesară — logica e în codul aplicației.

- [ ] AC6: Zero `any`. Tenant isolation. Design system tokens (nu se aplică — backend only).

---

## Files to create / modify

**Create:**
- `server/db/schema/finDataSettings.ts`
- `server/lib/piiAnonymizer.ts`
- `server/routes/finDataSettings.ts`
- `drizzle/0123_fin_data_settings.sql`
- `src/__tests__/fin/fin-pii-anonymizer.test.ts`

**Modify:**
- `server/db/schema/index.ts` — add `export * from "./finDataSettings";`
- `server/app.ts` — mount `finDataSettingsRoutes` at `/api/fin/data-settings`
- `drizzle/meta/_journal.json` — append journal entry for migration 0123

---

## Tests

- **T-TRUST-001-1** `[blocant]` Given text cu un email și un IBAN, When anonymizePii(), Then emailul și IBAN-ul sunt înlocuite cu tokens, textul original nu apare.
- **T-TRUST-001-2** `[blocant]` Given niciun rând în fin_data_settings pentru un tenant, When GET /api/fin/data-settings, Then returnează defaults (pseudonymize=true, retention=90, opt_in=false).
- **T-TRUST-001-3** `[blocant]` Given PATCH cu pseudonymize_ai_prompts=false, When GET imediat după, Then returnează pseudonymize=false.
- **T-TRUST-001-4** `[blocant]` Given PATCH cu ai_log_retention_days=400, Then 400 Bad Request (max 365).
- **T-TRUST-001-5** [normal] anonymizePii cu text fără PII returnează textul nemodificat.

---

## Definition of Done

- [ ] AC1–AC6 implementate
- [ ] T-TRUST-001-1..4 trec (blocante)
- [ ] Migration 0123 în drizzle/ + _journal.json actualizat
- [ ] Export în schema/index.ts + route montat în app.ts
- [ ] Build + typecheck + lint verzi pe fișierele noi
