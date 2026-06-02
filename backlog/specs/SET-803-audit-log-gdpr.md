---
id: SET-803
title: "Audit log + GDPR compliance (DPA download, data retention)"
milestone: SET
phase: "1 — Settings Foundation"
priority: P0
slug: audit-log-gdpr
depends_on: [SET-801]
status: pending
---

# SET-803 — Audit log + GDPR (DPA + data retention policies)

## Goal

Every destructive or sensitive action (delete student, merge lead, export data,
change role, login) is recorded in an `audit_log` table. Admins can review it at
`/app/settings/audit-log` with filters. Additionally, the tenant can download a
pre-filled Data Processing Agreement (DPA) PDF and configure automatic data
retention (e.g., delete lost leads after 12 months). This closes the GDPR
compliance gap required for RO schools.

## User stories

- Ca Owner, vreau să văd jurnalul de audit cu filtre (utilizator, acțiune, dată), pentru
  că trebuie să investighez incidente de securitate.
- Ca Admin, vreau să descarc DPA-ul pre-completat cu datele organizației, pentru că
  auditorul mă solicită să demonstrez că am semnat cu furnizorul de date.
- Ca Admin, vreau să configurez ștergerea automată a lead-urilor "Lost" după 12 luni,
  pentru că GDPR impune principiul minimizării datelor.
- Ca Compliance Officer, vreau să exportez jurnalul de audit ca CSV, pentru că
  auditorul cere dovezi în format standard.

## Acceptance criteria

- [ ] DB: tabel `audit_log` cu `(id, tenant_id, user_id, action, entity_type, entity_id,
      changes JSONB, ip_address, user_agent, created_at)`; index pe `(tenant_id,
      created_at DESC)`; migrare comisă
- [ ] Middleware / helper `logAudit(ctx, action, entity)` apelat automat pe:
      - Login reușit / eșuat
      - Create/update/delete student
      - Create/update/delete lead
      - Export date (CSV/ZIP)
      - Change user role
      - Deactivate user
- [ ] `GET /api/settings/audit-log` — paginat (limit/offset), filtre:
      `?userId=`, `?action=`, `?entityType=`, `?from=`, `?to=`; rezultat:
      `{ entries: [...], total }`; tenant-scoped
- [ ] `GET /api/settings/audit-log/export` — CSV download cu aceleași filtre
- [ ] `GET /api/settings/gdpr/dpa` — returnează PDF generat dinamic (sau HTML to PDF
      stub) cu datele tenantului pre-completate (nume, CUI, adresă din tenant row)
- [ ] `GET /api/settings/gdpr/retention` — returnează politicile configurate
- [ ] `PATCH /api/settings/gdpr/retention` — salvează: `{ leads_lost_days: number |
      null, inactive_students_days: number | null }` pe tenant
- [ ] Pagina `/app/settings/audit-log`:
      - Filtru dată (from/to date pickers)
      - Filtru acțiune (dropdown cu valorile distincte)
      - Filtru utilizator (combobox cu userii tenantului)
      - Tabel: Timestamp, Utilizator, Acțiune, Entitate, IP
      - Paginare (25 rânduri/pagină)
      - Buton "Export CSV"
- [ ] Pagina `/app/settings/gdpr` (sau tab):
      - Secțiune "DPA" — buton "Descarcă DPA" → PDF download
      - Secțiune "Retenție date" — inputs pentru număr de zile + switch Enable/Disable
      - Buton "Salvează politici"
- [ ] Dark mode parity, zero hardcoded colors

## Files

### New files
- `server/db/schema/audit_log.ts` — schema Drizzle
- `server/lib/audit.ts` — helper `logAudit()`
- `server/routes/settings/audit-log.ts`
- `server/routes/settings/gdpr.ts`
- `src/pages/settings/AuditLogPage.tsx`
- `src/pages/settings/GdprPage.tsx`
- `src/__tests__/settings/audit-log.test.ts`

### Modified files
- `server/db/schema/index.ts` — export audit_log
- `server/index.ts` — mount routere
- `server/routes/students.ts` — apel logAudit pe delete student
- `server/routes/auth.ts` — apel logAudit pe login
- `src/App.tsx` — rute `/app/settings/audit-log` și `/app/settings/gdpr`
- `src/components/layout/AppShell.tsx` — linkuri în sidebar Settings

## Tests

- **T-SET-803-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes,
  tabel audit_log există
- **T-SET-803-2** [blocant] Given: admin logat, When: login acțiune → GET
  /api/settings/audit-log, Then: 200 + array cu cel puțin un entry de tip "login"
- **T-SET-803-3** [blocant] Given: server pornit, When: POST /api/auth/login + GET
  /api/settings/audit-log?limit=5, Then: 200 cu `{ entries: [], total: number }` (portabilitate shape)
- **T-SET-803-4** [blocant] Given: rezultat din audit_log, When: `Array.isArray(entries)`,
  Then: true (nu `.rows`)
- **T-SET-803-5** [normal] Given: AuditLogPage randată cu date mock, When: utilizatorul
  selectează filtru acțiune "login", Then: tabelul afișează doar rânduri "login"
- **T-SET-803-6** [normal] Given: PATCH /api/settings/gdpr/retention cu
  `{ leads_lost_days: 365 }`, Then: 200 + valoarea salvată returnat

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-SET-803-x trec
- [ ] Migration comisă (`drizzle/0036_set803_audit_log.sql`)
- [ ] `db:reset && db:seed` succes
- [ ] Live API smoke: login + GET /api/settings/audit-log → 200
- [ ] logAudit apelat pe login + delete student
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/SET-faza-1-settings`
