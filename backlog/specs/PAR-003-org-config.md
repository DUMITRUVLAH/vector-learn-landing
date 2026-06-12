---
id: PAR-003
title: "Config org: budget codes / departments / projects / vendors / settings (CRUD + seed)"
milestone: PAR
phase: "A"
status: pending
attempts: 0
depends_on: [PAR-001]
spec: backlog/specs/PAR-003-org-config.md
core: backlog/par/PAR-CORE.md
---

## Goal

API CRUD pentru datele de referință pe care requestorul le alege la crearea unui PAR: budget codes,
departments, projects/programs (ex. „Digital Safeguard"), vendor/payee registry (cu validare IBAN/IDNP)
și `par_settings` (prag micro-purchase, monedă implicită, denumire legală org, logo, help URL,
prefix număr). Reutilizează validatorul IBAN/IDNP din PAR-103 (sau îl introduce aici ca lib comună).

## User stories

- **Ca** requestor, **vreau** să aleg budget code / department / project din liste, **pentru că** e mai rapid și fără greșeli decât să le tastez.
- **Ca** organizație, **vreau** un registru de payees reutilizabil, **pentru că** nu vreau să re-tastez IDNP/IBAN și să împrăștii date personale.
- **Ca** admin, **vreau** să setez pragul micro-purchase și moneda, **pentru că** ele schimbă rutarea aprobărilor.

## Acceptance criteria

- [ ] `GET/POST/PATCH/DELETE /api/par/budget-codes` (admin write, ceilalți read)
- [ ] `GET/POST/PATCH/DELETE /api/par/departments`
- [ ] `GET/POST/PATCH/DELETE /api/par/projects` (cu `donor` optional)
- [ ] `GET/POST/PATCH/DELETE /api/par/vendors` — payee registry; la POST/PATCH validează IBAN (mod-97) + IDNP (13 cifre); 400 la invalid
- [ ] `GET/PATCH /api/par/settings` (admin) — `micro_purchase_threshold_cents`, `default_currency`, `org_legal_name`, `org_logo_url`, `pdf_help_url`, `request_no_prefix`
- [ ] `server/lib/par/validators.ts` — `isValidIBAN`, `isValidMoldovaIBAN`, `isValidIDNP` (reutilizabile)
- [ ] Toate tenant-scoped; vendor/budget code al altui tenant NU apare
- [ ] Soft-delete prin `active=false` (nu hard delete — păstrăm referințele istorice pe PAR-uri)
- [ ] Rute montate în `server/app.ts`

## Files

**New:**
- `server/routes/parBudgetCodes.ts`, `server/routes/parDepartments.ts`, `server/routes/parProjects.ts`, `server/routes/parVendors.ts`, `server/routes/parSettings.ts`
- `server/lib/par/validators.ts` + `server/lib/par/__tests__/validators.test.ts`

**Modified:**
- `server/app.ts` — mount

## Tests

- **T-PAR-003-1** [blocant] Given admin, When `POST /api/par/budget-codes`, Then 201 + apare în GET
- **T-PAR-003-2** [blocant] Given IBAN MD valid → `POST /api/par/vendors` 201; IBAN invalid → 400
- **T-PAR-003-3** [blocant] Live API smoke: login + `GET /api/par/projects` → 200 (tenant-scoped)
- **T-PAR-003-4** [normal] Given vendor al altui tenant, Then NU apare în GET (izolare)
- **T-PAR-003-5** [blocant] Given `isValidIBAN("MD48ML000002259A19498121")` → true; `isValidIDNP("2008001007903")` → true; cazuri negative → false

## DoD

- Live API smoke verde · DB-portability (query builder) · reviewer APPROVED · personas salvate
