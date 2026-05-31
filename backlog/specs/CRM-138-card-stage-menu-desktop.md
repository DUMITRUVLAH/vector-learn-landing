---
id: CRM-138
title: "Meniu „mută în stadiu\" pe cardul kanban (desktop) — alternativă la drag, operabilă tastatură"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-105]
slug: card-stage-menu-desktop
---

## Goal

Pe desktop, singura cale de a muta un lead între stadii este **drag-and-drop** nativ
([LeadsPage.tsx:714-805](../../src/pages/app/LeadsPage.tsx#L714-L805)) — click pe card doar
deschide cartonașul. Drag-and-drop nativ **nu e operabil de la tastatură** (eșec WCAG 2.1.1
Keyboard) și e incomod la trackpad. Pe mobil meniul de stadiu există deja
([MobileLeadList.tsx:319-373](../../src/components/crm/MobileLeadList.tsx#L319-L373)) — îl aducem și pe desktop.

Adaugă pe `KanbanCard` un buton mic „mută" (sau badge stadiu clickabil) care deschide un meniu
cu lista de stadii; selectarea unuia mută lead-ul (cu motiv pierdere dacă stadiul e `isLost`).

---

## In scope

- Buton/badge pe `KanbanCard` (icon `ArrowRightLeft`, `aria-label` clar) care deschide un popover
  cu stadiile disponibile (exclude stadiul curent).
- Mutare la selecție prin `moveLeadStage`; dacă target `isLost` → reutilizează `LostReasonModal`.
- Complet operabil de la tastatură: focus pe buton, Enter/Space deschide, săgeți navighează, Esc închide.
- Refolosește logica `handleDrop`/`handleLostReasonConfirm` existentă; fără dublare.

## Out of scope

- Drag keyboard reordering în interiorul coloanei.
- Schimbarea fluxului de drag existent (rămâne, doar se adaugă alternativa).

---

## User stories

- **US-1**: Ca agent pe laptop cu trackpad, vreau să mut un lead fără să trag.
- **US-2**: Ca utilizator care navighează cu tastatura, vreau să pot muta un lead fără mouse.

---

## Acceptance criteria

- [ ] AC1: `KanbanCard` are un control vizibil „mută stadiu" cu `aria-label`.
- [ ] AC2: Click pe control deschide un meniu cu stadiile, fără stadiul curent.
- [ ] AC3: Selectarea unui stadiu non-lost mută lead-ul + toast succes + refetch.
- [ ] AC4: Selectarea unui stadiu `isLost` deschide `LostReasonModal` înainte de mutare.
- [ ] AC5: Meniul e operabil 100% de la tastatură (Tab/Enter/Esc/săgeți); focus trap corect.
- [ ] AC6: Click pe restul cardului încă deschide cartonașul (comportament neschimbat).
- [ ] AC7: 0 axe critical/serious; dark mode; no hardcoded hex; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — KanbanCard + handlers

### New
- `src/components/crm/StageMenu.tsx` (popover reutilizabil)
- `src/__tests__/crm/card-stage-menu.test.tsx`

---

## Tests

- **T-CRM-138-1** `[blocant]` Given card randat, Then există buton cu `aria-label` „mută/schimbă stadiu".
- **T-CRM-138-2** `[blocant]` Given meniu deschis, Then nu conține stadiul curent al lead-ului.
- **T-CRM-138-3** `[blocant]` Given selectare stadiu non-lost, Then `moveLeadStage` apelat cu stadiul corect.
- **T-CRM-138-4** `[blocant]` Given selectare stadiu lost, Then se deschide modalul de motiv (nu se mută direct).
- **T-CRM-138-5** Given Esc apăsat, Then meniul se închide și focus revine pe buton.

---

## Definition of Done

- [ ] Toate AC-urile implementate; T-CRM-138-1..5 trec
- [ ] build+typecheck+lint+test verzi; 0 axe critical/serious; dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate; PR deschis; STATE.json + BACKLOG.md actualizate
