---
id: CRM-117
title: Vedere Listă/Tabel comutabilă (sortare, coloane, paginare/virtual scroll)
milestone: CRM
phase: G
priority: P0
core_ref: [CRM-CORE.md §5]
tests: TEST-SCENARIOS.md#crm-117
depends_on: [CRM-105, CRM-113]
status: pending
---

# CRM-117 — Vedere Listă/Tabel

## Goal
Kanban-ul moare la volum mare (CRM-CORE §11.1 menționează 2.483 leaduri). O academie reală are
sute–mii de leaduri. Adăugăm o vedere **Listă/Tabel** comutabilă, sortabilă și paginată, ca CRM-ul
să rămână utilizabil la scală.

## In scope
- Toggle **[Kanban | Listă]** în header-ul `/app/leads` (persistat în localStorage per user).
- Tabel cu coloane: nume, companie, stadiu (badge), responsabil, sursă, valoare (€), datorie,
  ultim contact, următor task, creat. Coloane sortabile (click pe antet, asc/desc).
- Paginare server-side (`GET /api/leads?view=list&page=&pageSize=&sort=&dir=`) SAU virtual scroll
  client — alege paginare server (mai sigur la scală). Default 50/pagină.
- Refolosește filtrele existente (sursă/responsabil/search) — aceleași pe ambele vederi.
- Click pe rând → `/app/leads/:id`. Coloana stadiu editabilă inline (dropdown, ca în card).
- Densitate compactă; responsive (pe mobil colapsează la carduri — leagă cu CRM-121).

## Out of scope
- Bulk-select (e CRM-118). Export (e separat). Salvare vizualizări (e CRM-119).

## Acceptance criteria
- [ ] Toggle Kanban/Listă funcționează, persistă alegerea
- [ ] Tabel sortabil pe toate coloanele; paginare server-side corectă (tenant-scoped)
- [ ] Filtrele existente se aplică identic pe listă
- [ ] Endpoint `GET /api/leads` suportă view/page/pageSize/sort/dir; nu raw `.execute().rows` (§3.5.1)
- [ ] 1.000+ leaduri seed → randare < 100ms vizibil, fără freeze
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-117`. Blocante verzi (incl. integration smoke pe endpoint paginat).

## DoD
Standard (vezi BUILD-SEQUENCE).
