---
id: CRM-130
title: "Shortcuts tastatură kanban (n/e/j/k//) + WIP limits + collapse coloană"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-129]
slug: keyboard-shortcuts-wip
---

## Goal

Operatori de CRM petrec ore în kanban. Trei îmbunătățiri de viteză operațională care nu necesită
schimbări de schemă DB:

1. **Keyboard shortcuts** — navigare cu tastatură în kanban, conform standardului CRM:
   - `/` → focus pe câmpul de căutare
   - `n` → deschide modal „Adaugă lead nou"
   - `Escape` → închide orice modal deschis
   - `j` / `k` → selectează cardul următor / anterior (ciclu prin carduri vizibile)
   - `Enter` pe card selectat → navighează la `/app/leads/:id`
2. **WIP (Work In Progress) limits** — pe fiecare `pipeline_stage` setezi un `wip_limit` (ex: max 10 leaduri în „Contactat"); dacă e depășit, header-ul coloanei devine roșu cu count.
3. **Collapse coloană** — click pe antetul coloanei → coloana se comprimă la lățimea unui icon + count; click din nou → expandează. Starea e salvată în `localStorage`.

---

## In scope

- Hook `useKanbanKeyboard` în `src/hooks/useKanbanKeyboard.ts` — gestionează toate shortcut-urile
- Tooltip visible pe hover pe card care arată „Enter: deschide"
- WIP limit editat din `StagesEditorModal` (câmp nou `wip_limit` în tabel și form adăugare)
- `PATCH /api/pipeline-stages/:id` (endpoint existent) acceptă `wip_limit: number | null`
- Visual: header coloană roșu + count roșu când `count > wip_limit` (doar avertisment vizual, nu blochează drag)
- Collapse: click pe label coloană → coloana devine „stripe" îngustă cu badge count vertical; stare în `localStorage['crm-col-collapse']`
- Shortcut legend: o iconiță `?` în colțul dreapta-sus al paginii → popover cu lista shortcut-urilor

## Out of scope

- Drag cu tastatură (Faza J)
- WIP limits blocante (Faza J — azi e avertisment vizual)
- Shortcut-uri în `LeadCardPage.tsx`

---

## User stories

- **US-1**: Ca recepționer, vreau să apăs `/` și să pot căuta imediat fără să mut mâna la mouse.
- **US-2**: Ca manager, vreau să știu vizual când o coloană e supraîncărcată (>WIP), ca să redistribui leads.
- **US-3**: Ca utilizator cu monitor mic, vreau să colapsez coloanele „Pierdut" și „Client" ca să am loc mai mult.

---

## Acceptance criteria

- [ ] AC1: `/` în kanban (focusat pe pagina principală, nu într-un input) → focus pe câmpul de căutare cu cursorul activ.
- [ ] AC2: `n` → deschide `CreateLeadModal`.
- [ ] AC3: `Escape` → închide orice modal/popover deschis.
- [ ] AC4: `j`/`k` → navighează prin carduri vizibile (highlight vizual — ring primary); `Enter` → navigate la `/app/leads/:id`.
- [ ] AC5: Shortcuts dezactivate când focus e pe un input/textarea/select (nu interferează cu tastarea).
- [ ] AC6: `StagesEditorModal` — coloana „WIP" și câmp numeric „WIP limit" în form adăugare; `PATCH /api/pipeline-stages/:id` acceptă `wip_limit`.
- [ ] AC7: Header coloană roșu + text „X/WIP" când count > wip_limit.
- [ ] AC8: Click pe label coloană → coloana se comprimă la 48px lățime cu count vertical rotit; click din nou → expandează.
- [ ] AC9: Starea collapse/expand per coloană persistă în `localStorage` între reîncărcări.
- [ ] AC10: Iconiță `?` (KeyboardIcon sau `?` simplu) → popover cu lista shortcut-urilor.
- [ ] AC11: 0 axe critical/serious; dark mode; no hardcoded hex; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — integrate keyboard hook, collapse logic, shortcut legend button
- `src/lib/api/pipeline.ts` — include `wip_limit` în `PipelineStage` type și în `updatePipelineStage`
- `server/routes/pipeline.ts` — accept `wip_limit` in PATCH handler

### New
- `src/hooks/useKanbanKeyboard.ts` — keyboard shortcut hook
- `src/__tests__/crm/keyboard-shortcuts.test.tsx` — unit tests

---

## Tests

- **T-CRM-130-1** `[blocant]` Given `useKanbanKeyboard` montat, When tastez `/` (nu în input), Then callback `onSearch` e apelat.
- **T-CRM-130-2** `[blocant]` Given `useKanbanKeyboard`, When tastez `n` (nu în input), Then callback `onNewLead` e apelat.
- **T-CRM-130-3** `[blocant]` Given shortcut-ul `/` și focus pe un `<input>`, When tastez `/`, Then callback NU e apelat.
- **T-CRM-130-4** `[blocant]` Given stage cu `wip_limit=3` și `count=5`, Then header coloană conține clasa/text roșu.
- **T-CRM-130-5** Given stage cu `wip_limit=null`, Then header NU afișează indicator roșu indiferent de count.
- **T-CRM-130-6** `[blocant]` Given coloană colapsată în localStorage, When pagina se reîncarcă, Then coloana respectivă e încă colapsată.

---

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] T-CRM-130-1..6 trec (toate `[blocant]` trec)
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` — verzi
- [ ] 0 axe violations critical/serious
- [ ] Dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
