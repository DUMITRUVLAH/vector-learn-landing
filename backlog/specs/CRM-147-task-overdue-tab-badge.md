---
id: CRM-147
title: "Badge restanță pe tab-ul Task-uri al cartonașului"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-107, CRM-116]
slug: task-overdue-tab-badge
---

## Goal

Tab-ul „Task-uri (n)" numără doar taskurile open
([LeadCardPage.tsx:915](../../src/pages/app/LeadCardPage.tsx#L915)), dar nu evidențiază dacă vreunul
e **restant**. Agentul nu vede urgența fără să intre în tab. Adaugă un punct/badge roșu pe tab când
există cel puțin un task restant (`status:"open"` + `dueAt < now`).

---

## In scope

- Indicator roșu (dot sau badge cu număr) pe tab-ul Task-uri când există task-uri restante.
- Calcul restanță reutilizând logica existentă (`status==="open" && dueAt<now`).
- `aria-label` care anunță numărul de restanțe pentru screen reader.

## Out of scope

- Schimbarea ordinii task-urilor în tab (rămâne ca în CRM-107).

---

## User stories

- **US-1**: Ca agent, vreau să văd din tab dacă lead-ul are task restant, fără să-l deschid.

---

## Acceptance criteria

- [ ] AC1: Dacă există ≥1 task open cu `dueAt` trecut → tab-ul Task-uri afișează indicator roșu.
- [ ] AC2: Indicatorul arată numărul de restanțe (sau dot dacă numărul ar aglomera).
- [ ] AC3: Fără restanțe → fără indicator roșu (contorul de open rămâne).
- [ ] AC4: `aria-label` include numărul de restanțe.
- [ ] AC5: 0 axe critical/serious (contrast roșu); dark mode; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — tab bar

### New
- `src/__tests__/crm/task-overdue-badge.test.tsx`

---

## Tests

- **T-CRM-147-1** `[blocant]` Given un task open cu dueAt în trecut, Then tab Task-uri are indicator restanță.
- **T-CRM-147-2** Given toate task-urile în viitor sau done, Then niciun indicator roșu.
- **T-CRM-147-3** Given 2 restanțe, Then `aria-label` menționează „2".

---

## Definition of Done

- [ ] AC-uri; T-CRM-147-1..3 trec; build+typecheck+lint+test verzi
- [ ] Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md actualizate
