---
id: CRM-118
title: Bulk-select + acțiuni în masă (reasignează / stage / tag / șterge N leaduri)
milestone: CRM
phase: G
priority: P0
core_ref: [CRM-CORE.md §6.1, §9]
tests: TEST-SCENARIOS.md#crm-118
depends_on: [CRM-117]
status: pending
---

# CRM-118 — Acțiuni în masă

## Goal
După un import de 200 leaduri sau o curățenie de pipeline, un om trebuie să poată acționa pe zeci
de leaduri deodată, nu unul câte unul. Adăugăm selecție multiplă + acțiuni în masă în vederea listă.

## In scope
- Checkbox pe fiecare rând (vederea listă CRM-117) + „selectează tot pe pagină" / „selectează toate
  rezultatele filtrate" (cu count).
- Bară de acțiuni contextuală când ≥1 selectat: **Reasignează** (dropdown user), **Schimbă stadiu**,
  **Adaugă tag** (refolosește `lead_tags` din CRM-115), **Șterge** (confirm dublu, respectă GDPR §10).
- Endpoint `POST /api/leads/bulk` `{ ids[], action, params }` — tranzacțional, tenant-scoped,
  respectă permisiuni (vânzătorul doar pe leadurile lui — §9).
- Fiecare lead afectat primește un `lead_interaction type=system` („Reasignat în masă către X").
- Toast cu rezultat („18 leaduri reasignate, 2 sărite — fără permisiune").

## Out of scope
- Bulk send mesaj (rămâne pe COMM-204 broadcast). Bulk pe kanban (doar listă).

## Acceptance criteria
- [ ] Select all pe pagină + pe tot filtrul; count corect
- [ ] Cele 4 acțiuni funcționează tranzacțional; permisiuni respectate (§9)
- [ ] Ștergerea cere confirm dublu și anonimizează interacțiunile (GDPR §10)
- [ ] Fiecare lead afectat are interaction system de audit
- [ ] `POST /api/leads/bulk` tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-118`. Blocante verzi (incl. integration smoke + permisiuni cross-user).

## DoD
Standard.
