---
id: CRM-139
title: "Search auto-aplicat (debounced) în vederea Listă — consistent cu Kanban"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-117, CRM-119]
slug: debounced-search
---

## Goal

Filtrarea e inconsecventă între vederi: în **kanban** search-ul e instant (client-side), dar în
**listă** trebuie apăsat butonul „Aplică filtre"
([LeadsPage.tsx:403-412](../../src/pages/app/LeadsPage.tsx#L403-L412)). Userul tastează în
search, nu se întâmplă nimic, și crede că e bug. Adaugă debounce (300ms) care re-fetchează lista
automat când se schimbă search / sursă / responsabil — eliminând butonul manual (sau păstrându-l
doar ca shortcut redundant).

---

## In scope

- Debounce de ~300ms pe `searchQuery`, `filterSource`, `filterAssigned`, `filterNoTask`,
  `filterOverdue` care declanșează `fetchList({ page: 1 })` în modul listă.
- Indicator vizual discret „se filtrează…" (spinner mic) cât timp re-fetch-ul rulează.
- Elimină dependența de butonul „Aplică filtre" (sau îl păstrează ca no-op vizual ascuns când debounce activ).
- Anulare debounce la unmount (fără setState pe componentă demontată).

## Out of scope

- Server-side search fuzzy (rămâne `ILIKE`/substring existent).
- Schimbarea filtrării kanban (deja instant).

---

## User stories

- **US-1**: Ca agent, vreau ca lista să se filtreze imediat ce tastez, ca în kanban.

---

## Acceptance criteria

- [ ] AC1: Tastarea în search în modul listă declanșează re-fetch după ~300ms fără click pe buton.
- [ ] AC2: Schimbarea sursei/responsabilului re-fetchează lista automat.
- [ ] AC3: Debounce-ul colapsează apăsările rapide într-un singur fetch.
- [ ] AC4: Niciun warning React „setState on unmounted" la demontare în timpul unui fetch în curs.
- [ ] AC5: Comportamentul kanban rămâne neschimbat.
- [ ] AC6: 0 axe critical/serious; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx`

### New
- `src/hooks/useDebouncedValue.ts` (dacă nu există deja)
- `src/__tests__/crm/debounced-search.test.tsx`

---

## Tests

- **T-CRM-139-1** `[blocant]` Given modul listă + mock `fetchLeadsList`, When tastez „ana" rapid, Then fetch apelat o singură dată după debounce cu `search: "ana"`.
- **T-CRM-139-2** Given schimbare sursă, Then re-fetch declanșat automat.
- **T-CRM-139-3** `[blocant]` Given unmount în timpul debounce, Then niciun setState/fetch după unmount.

---

## Definition of Done

- [ ] Toate AC-urile; T-CRM-139-1..3 trec; build+typecheck+lint+test verzi
- [ ] 0 axe critical/serious; Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
