---
id: PAR-101
title: "PAR create API — header (secțiunile 1–9) + draft + numerotare PAR-2026-0001"
milestone: PAR
phase: "B"
status: pending
attempts: 0
depends_on: [PAR-002, PAR-003]
spec: backlog/specs/PAR-101-create-api.md
core: backlog/par/PAR-CORE.md
---

## Goal

API-ul de bază pentru un PAR: creează/citește/actualizează antetul cererii (secțiunile 1–9 din formular),
salvează ca `draft`, atribuie un `request_no` secvențial per tenant (`PAR-2026-0001`). Editarea e permisă
doar autorului cât timp e `draft` (sau `changes_requested`). Acesta e scheletul peste care se adaugă
line items (PAR-102), payee (PAR-103), atașamente (PAR-104).

## User stories

- **Ca** requestor, **vreau** să încep o cerere și să o salvez ca draft, **pentru că** o completez în mai mulți pași.
- **Ca** organizație, **vreau** numere de cerere unice și secvențiale, **pentru că** trebuie urmărite în contabilitate.
- **Ca** requestor, **vreau** să-mi văd doar propriile drafturi, **pentru că** nu trebuie să umblu în cererile altora.

## Acceptance criteria

- [ ] `POST /api/par` — creează un PAR `draft` cu câmpurile antet: `date_of_request` (default azi), `requested_by_user_id` (= user curent), `requestor_title`, `department_id`, `date_needed`, `project_id`, `budget_code_id`, `budget_code_note`, `purpose`, `charge_to`, `charge_billing_code`; întoarce 201 + obiectul
- [ ] `request_no` generat secvențial per tenant: `{prefix}-{YYYY}-{NNNN}` (din `par_settings.request_no_prefix`, default `PAR`); fără coliziuni la creări consecutive (tranzacție / `max(number)+1` cu guard)
- [ ] `GET /api/par` — listă tenant-scoped; requestor vede ale lui; approver/finance/admin văd după rol (filtre `status`, `purpose`, `project_id`, `q`)
- [ ] `GET /api/par/:id` — detaliu (header + line items + payee + attachments + approvals + payment), 404 cross-tenant
- [ ] `PATCH /api/par/:id` — doar autorul, doar dacă `status ∈ {draft, changes_requested}`; altfel 403
- [ ] `date_needed` (dacă setat) ≥ `date_of_request`; `purpose`/`charge_to` validate prin enum (400 la invalid)
- [ ] Query builder (fără raw `.execute().rows`); `Array.isArray(r)?r:r.rows` unde e nevoie
- [ ] Rute montate în `server/app.ts`

## Files

**New:**
- `server/routes/par.ts` — router principal `/api/par`
- `server/lib/par/requestNo.ts` — generator număr secvențial
- `server/routes/__tests__/par.test.ts`

**Modified:**
- `server/app.ts` — `app.route("/api/par", parRoutes)`

## Tests

- **T-PAR-101-1** [blocant] Given requestor, When `POST /api/par` valid, Then 201, `draft`, `request_no=PAR-2026-0001`
- **T-PAR-101-2** [blocant] Given 2 creări consecutive, Then numere unice incrementale
- **T-PAR-101-3** [blocant] DB-portability: query builder, rulează pe PGlite
- **T-PAR-101-4** [blocant] Given `purpose` invalid, Then 400
- **T-PAR-101-5** [normal] Given draftul altui user, When PATCH, Then 403
- **T-PAR-101-6** [blocant] Live API smoke: login + `POST /api/par` + `GET /api/par/:id` → 200

## DoD

- Migration/portability/live-smoke verzi · reviewer APPROVED · personas salvate
