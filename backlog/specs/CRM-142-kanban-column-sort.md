---
id: CRM-142
title: "Sortare per-coloană în kanban (recent / vechi / valoare / SLA)"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-105, CRM-124]
slug: kanban-column-sort
---

## Goal

Ordinea cardurilor în kanban vine direct din API, fără control. Un agent vrea „cele mai vechi
necontactate sus" sau „SLA roșu primul". Adaugă un control de sortare aplicat tuturor coloanelor
(client-side, peste `grouped`), persistat în localStorage.

---

## In scope

- Control de sortare în bara de acțiuni kanban: `Recent`, `Cele mai vechi`, `Valoare ↓`, `SLA întâi`.
- Sortarea se aplică client-side în `getFilteredLeads` peste rezultatul filtrat.
- Persistă alegerea în localStorage (`crm_kanban_sort`), ca `crm_view_mode`.
- „SLA întâi": roșu > galben > verde, apoi după vechime.

## Out of scope

- Sortare diferită per coloană (o singură sortare globală aplicată tuturor).
- Sortare server-side (rămâne client-side pe datele deja încărcate).

---

## User stories

- **US-1**: Ca agent, vreau lead-urile cu SLA depășit în capul coloanei ca să-i sun primii.
- **US-2**: Ca director, vreau să sortez după valoarea deal-ului pentru a prioritiza.

---

## Acceptance criteria

- [ ] AC1: Control de sortare vizibil în bara kanban cu 4 opțiuni.
- [ ] AC2: „Cele mai vechi" pune lead-urile cu `createdAt` cel mai vechi sus în fiecare coloană.
- [ ] AC3: „Valoare ↓" sortează descrescător după `valueCents`.
- [ ] AC4: „SLA întâi" pune `slaBadge:"red"` înaintea galbenului și verdelui.
- [ ] AC5: Alegerea persistă după refresh (localStorage).
- [ ] AC6: 0 axe critical/serious; dark mode; zero `any`; `<label>` pe control.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — control sortare + `getFilteredLeads` aplică sortarea

### New
- `src/__tests__/crm/kanban-column-sort.test.tsx`

---

## Tests

- **T-CRM-142-1** `[blocant]` Given lead-uri cu createdAt diferit + sort „vechi", Then primul e cel mai vechi.
- **T-CRM-142-2** `[blocant]` Given sort „Valoare", Then ordinea e descrescătoare după valueCents.
- **T-CRM-142-3** `[blocant]` Given sort „SLA", Then red înaintea yellow înaintea green.
- **T-CRM-142-4** Given sort ales + remount, Then se citește din localStorage.

---

## Definition of Done

- [ ] AC-uri; T-CRM-142-1..4 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
