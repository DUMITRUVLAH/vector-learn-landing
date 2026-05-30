---
id: CRM-136
title: "Kanban card density toggle — compact/comfortable, persistat per user"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-129, CRM-130]
slug: kanban-density-toggle
---

## Goal

Utilizatorii cu pipelines mari (50+ carduri pe coloană) doresc să vadă mai multe carduri
fără scroll. Adaugă un toggle compact/comfortable în toolbar-ul kanbanului care schimbă
densitatea cardurilor și e persistat în `localStorage` per utilizator (key `crm_density`).

---

## In scope

- **Două moduri**:
  - `comfortable` (default): cardul actual — avatar, badge stadiu, tags, deal value, dată, task signal
  - `compact`: card mai mic — doar `fullName`, badge stadiu colorat, valoare deal (opțional), fără avatar/tags/dată
- **Toggle UI**: în toolbar-ul `LeadsPage.tsx`, lângă butoanele de view (Kanban/Listă):
  icon `LayoutList` (compact) / `LayoutGrid` (comfortable); tooltip „Vizualizare compactă/normală".
- **Persistare**: `localStorage.setItem('crm_density', 'compact'|'comfortable')`.
  La mount, citit și aplicat imediat (fără flash).
- **`KanbanCard` component** (sau stiluri condiționale în componenta existentă):
  primește prop `density: 'compact' | 'comfortable'` și schimbă clasele Tailwind.
  - Compact: `py-1 px-2`, fără avatar, fără tags row, text-sm
  - Comfortable: stilul existent (py-3 px-3, avatar, tags, dată)
- **Hook** `useKanbanDensity()` — returnează `[density, setDensity]`, citește/scrie localStorage.
- Modul compact NU ascunde click-ul pe card (deschide `LeadCardPage` la fel).
- Modul compact NU ascunde drag-and-drop.
- Accesibil: toggle are `aria-pressed`, `aria-label`.

## Out of scope

- Persistare în baza de date (localStorage e suficient pentru MVP)
- Un al treilea mod (ex: list-only inside kanban columns)
- Density pentru list view (Lista e separată)
- Setare per coloană

---

## User stories

- **Andreea (director)**: Când am 40 de lead-uri în coloana „Contactat", dau toggle pe Compact
  și văd toată coloana fără scroll. Mâine la deschidere e tot Compact.
- **Agent CRM**: În mod Comfortable văd toate detaliile — avatar, tags, scadentre. Prefer
  informații bogate când am timp de calificare.

---

## Acceptance criteria

- [ ] Toggle compact/comfortable vizibil în toolbar `LeadsPage`.
- [ ] Modul compact: cardurile sunt mai mici (py-1 px-2, fără avatar, fără tags row).
- [ ] Modul comfortable: cardurile arată ca înainte (comportamentul existent).
- [ ] Selectarea compact → `localStorage['crm_density'] = 'compact'`.
- [ ] Reload pagină → density-ul ales e restaurat (fără flash de layout).
- [ ] Drag-and-drop funcționează în ambele moduri.
- [ ] Click pe card (compact sau comfortable) deschide `LeadCardPage`.
- [ ] Toggle are `aria-pressed` și `aria-label` corecte.
- [ ] Dark mode: ambele moduri arată corect.
- [ ] 0 violări axe critical/serious.
- [ ] TypeScript strict; `density` tipat ca `'compact' | 'comfortable'`, zero `any`.

---

## Files

### Nou
- `src/hooks/useKanbanDensity.ts` — hook localStorage
- `src/hooks/useKanbanDensity.test.ts` — unit tests

### Modificat
- `src/pages/app/LeadsPage.tsx` — toolbar cu toggle + pasa `density` la KanbanCard/Board
- `src/components/crm/KanbanCard.tsx` (sau echivalentul existent) — prop `density`, clase condiționale
- `backlog/crm/TEST-SCENARIOS.md` — adaugă scenariile CRM-136

---

## Tests (Given/When/Then)

- **T-CRM-136-1** `[blocant]` Given `useKanbanDensity` montat fără `localStorage`, Then returnează `'comfortable'` (default).
- **T-CRM-136-2** `[blocant]` Given `localStorage['crm_density'] = 'compact'`, When `useKanbanDensity` montat, Then returnează `'compact'`.
- **T-CRM-136-3** `[blocant]` Given `setDensity('compact')` apelat, Then `localStorage['crm_density']` este `'compact'` și state-ul e `'compact'`.
- **T-CRM-136-4** `[blocant]` Given `KanbanCard` cu `density='compact'`, Then render-ul conține clasă `py-1` și NU conține avatar element.
- **T-CRM-136-5** `[blocant]` Given `KanbanCard` cu `density='comfortable'`, Then render-ul conține avatar element.
- **T-CRM-136-6** `[blocant]` Given `DensityToggle` randat cu `density='compact'`, Then butonul compact are `aria-pressed='true'`.
- **T-CRM-136-7** Given `DensityToggle` cu `density='comfortable'`, When click pe butonul compact, Then `setDensity` e apelat cu `'compact'`.

---

## DoD (Definition of Done)

- [ ] Toate acceptance criteria bifate.
- [ ] Toate scenariile `[blocant]` verzi.
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verde.
- [ ] PR deschis pe `preview/sched-all` cu body structurat.
