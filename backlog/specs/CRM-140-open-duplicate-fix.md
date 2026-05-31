---
id: CRM-140
title: "Fix: „Deschide\" din alerta de duplicat navighează la lead (bug)"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-102]
slug: open-duplicate-fix
---

## Goal

Bug funcțional: butonul „Deschide" din alerta de duplicat de la creare lead nu deschide nimic —
apelează `onError` cu ID-ul ca text de toast în loc să navigheze
([LeadsPage.tsx:1562](../../src/pages/app/LeadsPage.tsx#L1562)). Funcția anti-duplicate (exact cea
care contează când previi dubluri) e ruptă. Repară-l să navigheze la cartonașul lead-ului existent.

---

## In scope

- `CreateLeadModal` primește acces la `navigate` (sau un callback `onOpenDuplicate(id)`).
- Click pe „Deschide" → `navigate(/app/leads/:id)` + închide modalul.
- Verifică același pattern și în `CRM-133` duplicate banner (dacă există un buton similar) și fixează dacă e cazul.

## Out of scope

- Schimbarea logicii de detectare duplicat (CRM-102/CRM-133).

---

## User stories

- **US-1**: Ca recepționer, când CRM-ul îmi spune că lead-ul există deja, vreau să apăs „Deschide" și să ajung pe el.

---

## Acceptance criteria

- [ ] AC1: Click pe „Deschide" în alerta de duplicat navighează la `/app/leads/<id-ul duplicatului>`.
- [ ] AC2: Modalul de creare se închide la navigare.
- [ ] AC3: „Creează oricum" rămâne funcțional (force create).
- [ ] AC4: Zero `any`; dark mode neschimbat.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — `CreateLeadModal`

### New
- `src/__tests__/crm/open-duplicate.test.tsx`

---

## Tests

- **T-CRM-140-1** `[blocant]` Given dedup mock cu duplicat id=X, When click „Deschide", Then `navigate` apelat cu `/app/leads/X`.
- **T-CRM-140-2** Given click „Creează oricum", Then `forceCreate` devine true și submit-ul nu mai e blocat.

---

## Definition of Done

- [ ] AC-uri implementate; T-CRM-140-1..2 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
