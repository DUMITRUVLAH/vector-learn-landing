---
id: CRM-146
title: "Iconițe contact mai vizibile pe card + flag „fără telefon/email\""
milestone: CRM
phase: J
status: pending
depends_on: [CRM-105]
slug: contact-icons-missing-flag
---

## Goal

Pe `KanbanCard` indicatorii de telefon/email sunt iconițe gri minuscule (`h-2.5 w-2.5` la
`text-muted-foreground/60` — [LeadsPage.tsx:755-758](../../src/pages/app/LeadsPage.tsx#L755-L758)),
sub pragul de contrast și aproape invizibile. Nu poți scana rapid „cine n-are date de contact".
Mărește iconițele, ridică contrastul și marchează vizibil lead-urile **fără** telefon ȘI fără email
(lead-uri „neapelabile") — un semnal de acțiune important.

---

## In scope

- Iconițe telefon/email mai mari (≥ `h-3.5 w-3.5`) și contrast conform (≥ 4.5:1, fără `/60`).
- Badge discret „Fără contact" când lead-ul nu are nici telefon nici email.
- Aplicabil pe KanbanCard și pe rândul din lista mobilă (consistență).
- `aria-label` clare („Are telefon", „Fără date de contact").

## Out of scope

- Validare/normalizare numere telefon.

---

## User stories

- **US-1**: Ca agent, vreau să văd dintr-o privire care lead-uri n-au cum să fie contactate.

---

## Acceptance criteria

- [ ] AC1: Iconițele telefon/email pe card sunt vizibile (≥ 3.5 unități, contrast ≥ 4.5:1).
- [ ] AC2: Lead fără telefon ȘI fără email afișează badge „Fără contact".
- [ ] AC3: Lead cu cel puțin un canal nu afișează badge-ul.
- [ ] AC4: `aria-label`-uri corecte pe iconițe/badge.
- [ ] AC5: 0 axe critical/serious (inclusiv contrast); dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — KanbanCard
- `src/components/crm/MobileLeadList.tsx` — paritate (opțional)

### New
- `src/__tests__/crm/contact-icons.test.tsx`

---

## Tests

- **T-CRM-146-1** `[blocant]` Given lead fără telefon și fără email, Then cardul conține badge „Fără contact".
- **T-CRM-146-2** Given lead cu telefon, Then badge-ul „Fără contact" nu apare.
- **T-CRM-146-3** Given card randat, Then iconițele au `aria-label` corect.

---

## Definition of Done

- [ ] AC-uri; T-CRM-146-1..3 trec; build+typecheck+lint+test verzi
- [ ] 0 axe critical/serious (contrast verificat); Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md
