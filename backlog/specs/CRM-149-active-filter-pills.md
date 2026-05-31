---
id: CRM-149
title: "Pills cu filtrele active + „×\" individual pe fiecare"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-119]
slug: active-filter-pills
---

## Goal

Când ai sursă + responsabil + search + semnale task active, nu există un sumar vizual al ce
filtrezi — doar butonul global „Resetează"
([LeadsPage.tsx:413-422](../../src/pages/app/LeadsPage.tsx#L413-L422)). Ușor să uiți că filtrezi și
să crezi că „nu mai ai lead-uri". Adaugă pills cu fiecare filtru activ, fiecare cu „×" propriu de
eliminare.

---

## In scope

- Rând de pills sub bara de filtre care arată fiecare filtru activ:
  „Sursă: Facebook ×", „Responsabil: Ana ×", „Căutare: „ana" ×", „Fără task ×", „Restanțe ×".
- „×" pe fiecare pill elimină doar acel filtru (re-fetch/re-filter).
- „Resetează tot" rămâne, dar pills oferă control granular.
- Pills apar în ambele vederi (kanban + listă).

## Out of scope

- Salvarea vederilor (există deja SavedViewsDropdown — CRM-119).

---

## User stories

- **US-1**: Ca agent, vreau să văd ce filtre am active și să le scot pe rând.

---

## Acceptance criteria

- [ ] AC1: Fiecare filtru activ apare ca pill cu etichetă lizibilă (sursă/responsabil pe nume/căutare/semnale).
- [ ] AC2: „×" pe un pill elimină doar acel filtru; restul rămân.
- [ ] AC3: Fără filtre active → niciun rând de pills.
- [ ] AC4: Pills consistente în kanban și listă; eliminarea re-fetchează în listă.
- [ ] AC5: 0 axe critical/serious; `aria-label` pe fiecare „×"; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx`

### New
- `src/components/crm/ActiveFilterPills.tsx`
- `src/__tests__/crm/active-filter-pills.test.tsx`

---

## Tests

- **T-CRM-149-1** `[blocant]` Given sursă=facebook + search="ana", Then 2 pills afișate cu etichetele corecte.
- **T-CRM-149-2** `[blocant]` Given click „×" pe pill-ul sursă, Then sursa revine la „all", search-ul rămâne.
- **T-CRM-149-3** Given niciun filtru, Then niciun pill randat.

---

## Definition of Done

- [ ] AC-uri; T-CRM-149-1..3 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
