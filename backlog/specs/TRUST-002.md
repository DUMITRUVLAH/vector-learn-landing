---
id: TRUST-002
title: "Jurnal audit AI — log acces + UI vizualizare + purge retenție"
milestone: FIN
phase: "16"
status: pending
depends_on: [TRUST-001]
spec: backlog/specs/TRUST-002.md
branch: feat/FIN-trust
---

## Goal

Expune tabelul `ai_audit_log` (construit în AI-A01) cu un UI minimal în FinDesk Settings
pentru ca directorul financiar să vadă TOATE apelurile AI: cine, când, ce acțiune, câte
tokene, cost estimat și dacă s-a pseudonimizat PII-ul. Adaugă ruta `GET /api/fin/ai-audit`
cu paginare, filtrare pe acțiune/dată, și un job de purge care respectă `ai_log_retention_days`
din `fin_data_settings` (TRUST-001).

FIN-CORE §1.16: tot ce privește audit-ul AI este obligatoriu pentru conformitate GDPR —
operatorul trebuie să poată demonstra că fiecare apel LLM a fost înregistrat și că datele
expirate au fost șterse.

Reuse: `aiAuditLog` schema (server/db/schema/aiAuditLog.ts) + `finDataSettings` (TRUST-001).
Nu crea tabele noi — doar rute noi + componentă UI.

---

## User stories

- Ca **director financiar**, vreau să văd o listă paginată a tuturor apelurilor AI (dată,
  utilizator, acțiune, tokene, cost, pseudonimizat), pentru că GDPR cere trasabilitatea
  completă a prelucrărilor automatizate.
- Ca **auditor**, vreau să filtrez log-ul după acțiune (lesson_summary, churn_prediction
  etc.) și dată, pentru că raportul de conformitate acoperă perioade specifice.
- Ca **sistem**, vreau ca rândurile mai vechi decât `ai_log_retention_days` să fie șterse
  automat la cerere (purge on-demand), pentru că GDPR art. 5(1)(e) impune limitarea stocării.

---

## Acceptance criteria

- [ ] AC1: `GET /api/fin/ai-audit?page=1&limit=50&action=X&from=ISO&to=ISO` — returnează
  `{ data: AiAuditLogEntry[], total: number, page: number }`. Tenant-izat via `session.tenantId`.
  Filtre opționale: `action` (exact match), `from`/`to` (createdAt range). Sortare: `created_at DESC`.
  Nu raw `.execute().rows` — Drizzle query builder.

- [ ] AC2: `POST /api/fin/ai-audit/purge` — șterge din `ai_audit_log` toate rândurile al căror
  `created_at < NOW() - ai_log_retention_days zile` (din `fin_data_settings` al tenantului).
  Returnează `{ deleted: number }`. Accesibil doar cu rol `admin` sau `finance`.

- [ ] AC3: Componentă `FinAiAuditPage` în `/app/fin/settings/ai-audit` —
  - Tabel cu coloanele: Data, Utilizator, Acțiune, Model, Tokene (in+out), Cost ($), Pseudonimizat.
  - Paginare (Next/Prev), filtru pe acțiune (select) și interval de date.
  - Buton „Purge log vechi" cu confirmare dialog; afișează `N înregistrări șterse`.
  - Folosind doar tokeni design-system (fără hex). Dark mode funcțional.
  - Rută wired în `App.tsx` sau router-ul existent al fin-settings.

- [ ] AC4: Linkul din `/app/fin/settings` (pagina de setări FinDesk) duce la `/app/fin/settings/ai-audit`.
  Dacă nu există un nav fin-settings, adaugă sidebar item „Audit AI" în nav-ul FinDesk existent.

- [ ] AC5: Test unitar acoperă: fetch paginat (mock DB), purge calculează corect data-limită din
  `ai_log_retention_days`, componenta se renderizează fără crash cu date mock.

---

## Files

### New
- `server/routes/finAiAudit.ts` — GET /api/fin/ai-audit + POST /api/fin/ai-audit/purge
- `src/pages/fin/FinAiAuditPage.tsx` — tabel + filtru + purge
- `src/__tests__/fin/fin-ai-audit.test.ts` — unit tests

### Modified
- `server/app.ts` — mount finAiAuditRoutes pe `/api/fin/ai-audit`
- `src/App.tsx` (sau router fin) — adaugă ruta `/app/fin/settings/ai-audit`

---

## Tests

- **T-TRUST-002-1** [blocant] Given server running, When `POST /api/auth/login` + `GET /api/fin/ai-audit`, Then 200 cu `{ data: [], total: 0, page: 1 }` (sau cu date reale dacă există)
- **T-TRUST-002-2** [blocant] Given `ai_log_retention_days=30` în fin_data_settings, When `POST /api/fin/ai-audit/purge`, Then răspuns 200 cu `{ deleted: N }` și rânduri mai vechi de 30 zile au dispărut
- **T-TRUST-002-3** [blocant] Given componentă `FinAiAuditPage`, When render cu date mock, Then nu crează crash + tabelul afișează coloanele corecte
- **T-TRUST-002-4** [normal] Given filtre `action=lesson_summary`, When GET /api/fin/ai-audit?action=lesson_summary, Then returnează doar rânduri cu action=lesson_summary
- **T-TRUST-002-5** [normal] Given ruta `/app/fin/settings/ai-audit` în App.tsx, When navigare, Then componenta FinAiAuditPage se montează

---

## Definition of Done

- [ ] Toate AC-urile trecute
- [ ] Toate T-urile [blocant] verzi
- [ ] Build + typecheck + lint verde
- [ ] migration gate: nicio migrare nouă necesară (reutilizează `ai_audit_log` existent)
- [ ] Route mount confirmat în `server/app.ts`
- [ ] Schema index confirmat (nu e nevoie — `aiAuditLog` deja exportat)
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
