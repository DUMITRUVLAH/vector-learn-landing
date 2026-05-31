---
id: CRM-148
title: "„Convertit\" duce la fișa studentului (link din cartonaș + card)"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-111]
slug: converted-link-to-student
---

## Goal

Badge-ul „Convertit" e text static pe cartonaș
([LeadCardPage.tsx:893-898](../../src/pages/app/LeadCardPage.tsx#L893-L898)) și pe card
([LeadsPage.tsx:786-791](../../src/pages/app/LeadsPage.tsx#L786-L791)). După conversie, agentul vrea
un click spre fișa studentului. Transformă-l în link către `/app/students/:convertedToStudentId`.

---

## In scope

- Pe cartonaș: blocul „Convertit la {dată}" devine link/buton „Vezi studentul →".
- Pe KanbanCard: marcajul „Convertit" devine clickabil → navighează la student (fără a declanșa
  deschiderea cartonașului lead-ului).
- Verifică ruta studentului există (`/app/students/:id`); dacă nu, link la lista de studenți filtrată.

## Out of scope

- Schimbarea fluxului de conversie (CRM-111).

---

## User stories

- **US-1**: Ca agent, după ce convertesc un lead, vreau un click direct spre fișa studentului.

---

## Acceptance criteria

- [ ] AC1: Pe cartonaș, lead convertit afișează „Vezi studentul →" care navighează la `/app/students/<id>`.
- [ ] AC2: Pe KanbanCard, click pe „Convertit" navighează la student fără a deschide cartonașul lead-ului (`stopPropagation`).
- [ ] AC3: Dacă `convertedToStudentId` lipsește, nu se randează link rupt.
- [ ] AC4: `aria-label` clar; touch target ≥ 44px pe card.
- [ ] AC5: 0 axe critical/serious; dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx`
- `src/pages/app/LeadsPage.tsx` — KanbanCard

### New
- `src/__tests__/crm/converted-link.test.tsx`

---

## Tests

- **T-CRM-148-1** `[blocant]` Given lead cu `convertedToStudentId=X`, Then cartonașul are link spre `/app/students/X`.
- **T-CRM-148-2** `[blocant]` Given click pe „Convertit" pe card, Then `navigate` la student, NU se deschide cartonașul lead.
- **T-CRM-148-3** Given lead neconvertit, Then niciun link de student.

---

## Definition of Done

- [ ] AC-uri; T-CRM-148-1..3 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
