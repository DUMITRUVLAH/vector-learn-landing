---
id: CRM-105
title: Pipeline — stadii personalizabile, motiv pierdere, filtre
milestone: CRM
phase: B
priority: P0
core_ref: [CRM-CORE.md §5, §4]
tests: TEST-SCENARIOS.md#crm-105
depends_on: []
status: pending
---

# CRM-105 — Pipeline avansat

## Goal
Kanban-ul reflectă procesul real al fiecărui centru: stadii configurabile, motiv obligatoriu la
pierdere, filtre utile.

## In scope
- Tabel `pipeline_stages` (key, label, color, order_index, is_won, is_lost). Seed cu cele 5
  default (new/contacted/trial/paid/lost).
- Editor `⚙ Stadii` (owner/manager): adaugă/redenumește/reordonează/colorează stadii.
- Kanban citește coloanele din `pipeline_stages` (nu hardcodat).
- Drop în stadiu `is_lost` → modal motiv pierdere obligatoriu (categorii predefinite + custom);
  fără motiv → mutarea se anulează.
- Bara de filtre: sursă, responsabil (`assigned_to`), search live (nume+telefon normalizat).
- Fiecare mutare scrie `interaction type=stage_change`.

## Out of scope
- Pagina detaliu (CRM-106), conversia la drop în „paid" (CRM-111 — până atunci, drop în paid
  schimbă stage-ul ca azi).

## Acceptance criteria
- [ ] Stadiu nou apare ca o coloană cu order/culoare corecte
- [ ] Lost fără motiv anulează mutarea; cu motiv salvează `lost_reason`
- [ ] Filtre client-side fără refetch; search live corect
- [ ] `stage_change` scris în timeline la fiecare mutare
- [ ] Drag-drop accesibil; 0 violări axe; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-105` (T-CRM-105-1..5). Blocante verzi.

## DoD
Standard.
