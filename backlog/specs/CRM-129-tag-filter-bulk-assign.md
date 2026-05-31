---
id: CRM-129
title: "Filtru tag în kanban + reasignare bulk + vizualizare „Ziua mea""
milestone: CRM
phase: I
status: pending
depends_on: [CRM-115, CRM-116]
slug: tag-filter-bulk-assign
---

## Goal

Trei îmbunătățiri de productivitate direct cerute de Andreea (friction CRM-115 #1) și comune
în CRM-urile reale:

1. **Filtru tag** în bara kanban — selectezi un tag și doar leadurile cu tagul respectiv rămân vizibile.
2. **Reasignare bulk** — selectezi mai multe carduri (checkbox hover), apoi alegi un responsabil → `PATCH /api/leads/bulk-assign`.
3. **Vizualizare „Ziua mea"** — un buton în bara de filtre care filtrează la leadurile cu task-uri scadente azi (due_date = astăzi) atribuite utilizatorului curent.

Nicio schimbare de schemă DB sau migrație necesară — toate sunt filtre/operațiuni pe date existente,
cu un nou endpoint de bulk.

---

## In scope

- Dropdown „Filtrează după tag" în bara de filtre a kanban (`LeadsPage.tsx`)
- Multi-select carduri (checkbox apare la hover pe card, sau „Selectează toate" per coloană)
- Buton „Reasignează X lead-uri" (apare când ≥ 1 card selectat) → modal cu dropdown utilizatori
- Endpoint `PATCH /api/leads/bulk-assign` → `{ leadIds: string[], assignedTo: string | null }`
- Buton „Ziua mea" în bara de filtre → filtrează după `nextTask.dueAt = today` AND `nextTask.assignedTo = currentUserId`
- Badge cu numărul de carduri selectate în header
- Deselect all cu X sau Escape

## Out of scope

- Round-robin auto-assign (Faza J)
- Saved views (Faza J)
- Bulk delete sau bulk stage change

---

## User stories

- **US-1**: Ca recepționer, vreau să văd rapid toate leadurile cu tag „vip" ca să le prioritizez.
- **US-2**: Ca manager, vreau să selectez 15 leaduri necontactate și să le asignez unui vânzător nou în 5 secunde.
- **US-3**: Ca vânzător, vreau să văd „Ziua mea" — leadurile cu task-uri scadente azi — ca să știu cu ce să încep dimineața.

---

## Acceptance criteria

- [ ] AC1: Dropdown tag în bara filtre; „Toate tag-urile" implicit; selectând un tag → kanban afișează doar cardurile care au acel tag.
- [ ] AC2: Filtrul de tag funcționează combinat cu filtrele existente (sursă, responsabil, search, fără-task, restanțe).
- [ ] AC3: Hover pe card → apare checkbox (top-left); click checkbox → cardul intră în selecție (border primary, checkmark).
- [ ] AC4: Badge „X selectate" + buton „Reasignează" apar în header când ≥ 1 card selectat.
- [ ] AC5: Modal „Reasignează X lead-uri" → input/dropdown cu utilizatorii tenantului (sau câmp liber UUID dacă nu există endpoint /api/users) → Confirmă → `PATCH /api/leads/bulk-assign` → toast succes + refresh pipeline.
- [ ] AC6: Buton „Ziua mea" în bara de filtre → filtrează leadurile cu task scadent azi (`dueAt` în intervalul 00:00–23:59 local) și `assignedTo` = `currentUser.id`; activ = fundal primar.
- [ ] AC7: Escape sau click X → deselect all.
- [ ] AC8: 0 axe critical/serious; dark mode OK; no hardcoded hex.
- [ ] AC9: TypeScript strict — props interfaces pentru fiecare componentă nouă; zero `any`.
- [ ] AC10: `PATCH /api/leads/bulk-assign` — tenant-scoped; returnează `{ updated: number }`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — tag filter dropdown, multi-select logic, bulk assign button + modal, "Ziua mea" filter
- `src/lib/api/leads.ts` — add `bulkAssignLeads(leadIds, assignedTo)` function
- `server/routes/leads.ts` — add `PATCH /api/leads/bulk-assign` endpoint

### New (if needed)
- `src/__tests__/crm/tag-filter-bulk.test.tsx` — unit tests

---

## Tests (scenarii gate dur)

- **T-CRM-129-1** `[blocant]` Given kanban cu leads tagged „vip" și „organic", When selectez filtrul „vip", Then doar leadurile cu tag „vip" rămân vizibile în toate coloanele.
- **T-CRM-129-2** `[blocant]` Given 3 leaduri selectate, When apas „Reasignează", Then `PATCH /api/leads/bulk-assign` e chemat cu cele 3 ID-uri și noul assignedTo; pipeline reîncarcă.
- **T-CRM-129-3** `[blocant]` Given butonul „Ziua mea" activ, Then se afișează doar leadurile cu nextTask.dueAt = today (date string ISO = data curentă locală).
- **T-CRM-129-4** Given filtrul tag „vip" + filtrul sursă „Facebook" activ simultan, Then se afișează numai leadurile cu tag „vip" ȘI source = „facebook_ad".
- **T-CRM-129-5** Given Escape apăsat cu carduri selectate, Then selecția se șterge.
- **T-CRM-129-6** `[blocant]` `PATCH /api/leads/bulk-assign` cu leadIds din tenant B → 403/0 rânduri afectate (tenant safety).

---

## Definition of Done

- [ ] Toate AC-urile de mai sus implementate și funcționale
- [ ] T-CRM-129-1..6 trec (toate `[blocant]` trec)
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` — verzi
- [ ] 0 axe violations critical/serious
- [ ] Dark mode: componentele noi arată corect
- [ ] Reviewer APPROVED; persona reports salvate
- [ ] PR deschis cu corp structurat; STATE.json + BACKLOG.md actualizate
