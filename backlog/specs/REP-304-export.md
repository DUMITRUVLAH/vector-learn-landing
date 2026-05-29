---
id: REP-304
title: "Export rapoarte: CSV plăți + CSV elevi + download din UI"
milestone: REP
phase: "4 — Export"
priority: P0
slug: export
depends_on: [REP-301]
status: pending
---

# REP-304 — Export rapoarte CSV

## Goal

Descărcare date brute în format CSV direct din browser: plăți lunare și lista elevilor activi.
Necesar contabililor pentru import în SAGA/SAP.

## In scope

- **API `GET /api/analytics/export/payments`**:
  - Query: `?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returnează CSV: id, student_name, amount, currency, status, due_date, paid_at, description
  - Content-Type: text/csv; filename: payments-YYYY-MM-DD.csv
  - Tenant-scoped, auth required
- **API `GET /api/analytics/export/students`**:
  - Returnează CSV: id, full_name, status, email, phone, parent_email, parent_phone, created_at
  - Content-Type: text/csv
- **UI în AnalyticsPage** (tab Export sau butoane pe alte taburi):
  - Date picker from/to pentru export plăți
  - Butoane „Descarcă plăți CSV" + „Descarcă elevi CSV"
  - Click → `<a href download>` sau fetch + blob URL
  - Toast confirmare

## Out of scope

- Excel/XLSX (ar necesita o librărie suplimentară)
- PDF export
- Scheduled email

## Acceptance criteria

- [ ] GET /api/analytics/export/payments → 200, Content-Type text/csv, CSV valid
- [ ] GET /api/analytics/export/students → 200, CSV valid
- [ ] Download din UI funcțional
- [ ] CSV are header row + datele corecte

## Tests

1. [blocant] GET /api/analytics/export/payments → 200, Content-Type: text/csv
2. [blocant] GET /api/analytics/export/students → 200, CSV cu header
3. [normal] Download trigger în UI

## DoD

Standard.
