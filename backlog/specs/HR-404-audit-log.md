---
id: HR-404
title: "Audit log HR: schimbări rate/rol/permisiuni cu actor + timestamp"
milestone: HR
phase: "4 — Audit"
priority: P0
slug: audit-log
depends_on: [HR-401]
status: pending
---

# HR-404 — Audit log HR

## Goal

Tabel `audit_log` care înregistrează schimbările critice HR: modificări rate profesor,
schimbări de status payroll, invitații de utilizatori. UI cu filtru per tip + export CSV.

## In scope

- **Schema `audit_log`**:
  `id, tenant_id, actor_id (FK users), action_type varchar(64), target_type, target_id,
  old_value jsonb, new_value jsonb, ip_address, occurred_at`
- **Migration** 0013
- **Hook în existente route-uri**:
  - PATCH /api/teachers/:id → log `teacher.rate_changed`
  - PATCH /api/hr/payroll/:id → log `payroll.status_changed`
- **API `GET /api/hr/audit-log`**: lista entries per tenant, filtrabil `?action_type=&limit=`
- **UI `/app/hr/audit`**: tabel cu actor, acțiune, target, before/after, timestamp
  - Filtru action_type + search actor
  - Link „Export CSV" → GET /api/hr/audit-log/export

## Out of scope

- 7 ani retenție (storage management)
- Email alerting per eveniment

## Acceptance criteria

- [ ] Migration 0013 commitată
- [ ] GET /api/hr/audit-log → 200, array
- [ ] Audit entry creat la PATCH /api/teachers/:id cu rate change
- [ ] UI tabel audit visible

## Tests

1. [blocant] GET /api/hr/audit-log → 200
2. [blocant] PATCH /api/teachers/:id → audit entry creat
3. [normal] UI tabel renderează

## DoD

Standard.
