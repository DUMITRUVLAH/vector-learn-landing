---
id: CRM-151
title: "Mobil: grupează acțiunile secundare (Stadii/Import) într-un meniu „⋯\"; păstrează doar FAB pentru adăugare"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-122]
slug: mobile-action-overflow-menu
---

## Goal

Bara de acțiuni a pipeline-ului aglomerează 4 acțiuni + toggle vedere
([LeadsPage.tsx:294-355](../../src/pages/app/LeadsPage.tsx#L294-L355)); pe mobil etichetele dispar și
rămân iconițe ambigue. În plus „Adaugă" apare dublu: în bară și ca FAB
([LeadsPage.tsx:548-555](../../src/pages/app/LeadsPage.tsx#L548-L555)). Pe mobil, mută acțiunile
secundare („Stadii", „Import") într-un meniu overflow „⋯" și lasă FAB-ul ca unica cale de adăugare.

---

## In scope

- Sub `lg`, „Stadii" și „Import" intră într-un meniu „⋯" (popover accesibil); rămân vizibile direct pe desktop.
- Pe mobil, ascunde butonul „Adaugă lead" din bară (FAB-ul deja există); pe desktop rămâne.
- Toggle Kanban/Listă rămâne vizibil (e schimbare de mod, nu acțiune secundară).
- Meniul „⋯" complet accesibil (tastatură, `aria-haspopup`, focus, Esc).

## Out of scope

- Redesign complet al barei; doar reorganizare responsive.

---

## User stories

- **US-1**: Ca agent pe telefon, vreau o bară curată cu acțiunile rare ascunse într-un meniu.

---

## Acceptance criteria

- [ ] AC1: Sub `lg`, „Stadii" și „Import" sunt accesibile dintr-un buton „⋯", nu direct în bară.
- [ ] AC2: Pe `lg+`, „Stadii" și „Import" rămân butoane directe (comportament desktop neschimbat).
- [ ] AC3: Sub `lg`, butonul „Adaugă lead" din bară nu se randează (rămâne doar FAB-ul).
- [ ] AC4: Meniul „⋯" e operabil de la tastatură; Esc închide; `aria-haspopup`/`aria-expanded` corecte.
- [ ] AC5: 0 axe critical/serious; touch target ≥ 44px; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — bara de acțiuni responsive

### New
- `src/__tests__/crm/mobile-action-menu.test.tsx`

---

## Tests

- **T-CRM-151-1** `[blocant]` Given viewport < lg, Then „Stadii"/„Import" sunt în meniul „⋯", nu direct.
- **T-CRM-151-2** Given viewport ≥ lg, Then „Stadii"/„Import" sunt butoane directe.
- **T-CRM-151-3** `[blocant]` Given Esc cu meniul deschis, Then meniul se închide.

---

## Definition of Done

- [ ] AC-uri; T-CRM-151-1..3 trec; build+typecheck+lint+test verzi
- [ ] 0 axe critical/serious; Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
