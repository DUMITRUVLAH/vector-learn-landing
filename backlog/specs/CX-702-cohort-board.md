---
id: CX-702
title: "CX: pagină cohorte cu tab-uri Active/Viitoare/Trecute + progres — UI portat din copy-roas"
milestone: CX
phase: 1
status: pending
depends_on: [CX-701]
slug: cohort-board
---

## Goal

Portează ecranul principal CX din copy-roas (`src/pages/CX.tsx`) ca pagină nouă `/app/cx` în
design system-ul nostru (Vector 365). Tab-uri categorii + selector de cohortă + header cu progres,
fără partea de participanți încă (vine în CX-703).

## Idei de cod / UX trase din copy-roas

`src/pages/CX.tsx`:
- Bară de tab-uri: **Active (N) · Viitoare (N) · Trecute (N)** (plus „Tasks" și „SMS" în original —
  pe acelea le lăsăm pentru fază ulterioară / out of scope).
- Sub tab-uri, un **selector orizontal scrollabil de cohorte** (`ScrollArea` + butoane): fiecare
  buton arată `course_name` + `edition • d MMM`. Cohorta selectată e evidențiată cu border-top primary.
- Header cohortă: titlu `curs - ediție`, sub-text `start → end`, și un **widget de progres compact**
  (`Progress` + „{daysRemaining}d rămase" / „Începe în {n}d" / „Finalizat", + `{percent}%`).
- Empty states per tab („Nu există ediții active (luna curentă + luna viitoare)" etc.).

## In scope

- Pagina `src/pages/app/CXPage.tsx` montată pe `/app/cx`, în layout-ul app existent.
- Consumă `GET /api/cohorts` (cu `endDate`+`progress` din CX-701) via clientul nostru de fetch/query.
- Tab-uri Active/Viitoare/Trecute pe baza `classifyCohort`.
- Selector de cohortă (scroll orizontal), selecția persistă în state.
- Header + widget progres, toate cu **tokens semantice** (`bg-muted`, `text-muted-foreground`,
  `text-primary`), dark mode, touch targets ≥ 44px.
- Buton „Export" placeholder (CSV vine în CX-704) — dezactivat sau ascuns deocamdată.
- Card de navigare către CX adăugat pe hub-ul de module dacă există un index de module.

## Out of scope

- Tabelele de participanți (CX-703).
- Export CSV real (CX-704).
- Break-even/profit badge (CX-705).
- Tasks săptămânale + SMS (fază viitoare, nu acum).

---

## User stories

- **US-1**: Ca manager, vreau să văd cohortele grupate în Active/Viitoare/Trecute și să comut între ele.
- **US-2**: Ca manager, vreau să văd dintr-o privire cât a mai rămas dintr-o cohortă.

---

## Acceptance criteria

- [ ] AC1: `/app/cx` randează tab-urile cu count corect din date reale.
- [ ] AC2: Selectorul listează cohortele tabului curent; selecția schimbă header-ul.
- [ ] AC3: Widget progres arată corect cele 3 stări (upcoming/active/completed).
- [ ] AC4: Empty state per tab când nu există cohorte.
- [ ] AC5: 0 axe critical/serious; dark mode; fără hex hardcodat; zero `any`.
- [ ] AC6: Lighthouse a11y/perf ≥ 90 pe `/app/cx`.

---

## Files

### New
- `src/pages/app/CXPage.tsx`
- `src/components/modules/cx/CohortTabs.tsx`
- `src/components/modules/cx/CohortProgress.tsx`
- `src/__tests__/cx/cohort-board.test.tsx`

### Modified
- router (înregistrare `/app/cx`)
- index module/navigație (card CX) dacă există

---

## Tests

- **T-CX-702-1** `[blocant]` 3 cohorte (1 activă, 1 viitoare, 1 trecută) → fiecare tab arată count 1.
- **T-CX-702-2** `[blocant]` Click pe o cohortă → header reflectă cursul/ediția selectată.
- **T-CX-702-3** Cohortă viitoare → widget arată „Începe în Nd", percent 0.

---

## Definition of Done

- [ ] AC-uri; T-CX-702-1..3 trec; build+typecheck+lint+test verzi
- [ ] Lighthouse + axe verzi (page item)
