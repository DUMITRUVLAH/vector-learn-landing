---
id: CRM-143
title: "Toast cu „Anulează\" la mutarea de stadiu (undo) — kanban + listă + mobil"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-105, CRM-127]
slug: undo-stage-move
---

## Goal

Mutarea de stadiu (`handleDrop` [LeadsPage.tsx:248-271](../../src/pages/app/LeadsPage.tsx#L248-L271))
e instant și **nu se poate anula**, spre deosebire de ștergere care are deja undo (CRM-127). Pe un
board aglomerat, drop-urile accidentale sunt frecvente. Adaugă un toast cu „Anulează" (5s) după
fiecare mutare de stadiu, care readuce lead-ul în stadiul anterior.

---

## In scope

- După `moveLeadStage` reușit, toast „Mutat la X · Anulează (5s)" cu countdown.
- „Anulează" → `moveLeadStage` înapoi la stadiul anterior (memorat înainte de mutare) + refetch.
- Aplicabil în: drop kanban, schimbare stadiu din listă (`onStageChange`), bottom-sheet mobil.
- Refolosește `UndoToast` existent (CRM-127) acolo unde se potrivește.
- Mutarea în stadiu `isLost` (cu motiv) — undo readuce stadiul + șterge marcajul de pierdere.

## Out of scope

- Undo pentru schimbări de scor / conversie (alt flux).

---

## User stories

- **US-1**: Ca agent, dacă mut greșit un lead, vreau 5 secunde să anulez.

---

## Acceptance criteria

- [ ] AC1: După un drop reușit în kanban, apare toast „Anulează (5s)" cu countdown.
- [ ] AC2: Click „Anulează" în 5s readuce lead-ul în stadiul anterior (verificat în UI + un singur `moveLeadStage` invers).
- [ ] AC3: După 5s fără click, toast-ul dispare, nicio acțiune suplimentară.
- [ ] AC4: Undo funcționează identic în vederea listă (`onStageChange`).
- [ ] AC5: Pentru mutare în lost, undo restaurează stadiul anterior.
- [ ] AC6: 0 axe critical/serious; `role="status"`/`aria-live`; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — handlers drop/stage cu undo
- `src/components/crm/MobileLeadList.tsx` — undo pe bottom-sheet (opțional dacă timpul permite)

### New
- `src/__tests__/crm/undo-stage-move.test.tsx`

---

## Tests

- **T-CRM-143-1** `[blocant]` Given mutare reușită, Then toast cu buton „Anulează" apare.
- **T-CRM-143-2** `[blocant]` Given click „Anulează", Then `moveLeadStage` apelat cu stadiul anterior.
- **T-CRM-143-3** Given niciun click în 5s, Then `moveLeadStage` invers NU e apelat.

---

## Definition of Done

- [ ] AC-uri; T-CRM-143-1..3 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
