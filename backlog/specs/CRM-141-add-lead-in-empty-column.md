---
id: CRM-141
title: "„+ Adaugă lead\" direct în coloana goală a kanban-ului"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-105]
slug: add-lead-in-empty-column
---

## Goal

Coloana goală afișează doar textul mut „Trage aici"
([LeadsPage.tsx:592-595](../../src/pages/app/LeadsPage.tsx#L592-L595)) — nu invită nicio acțiune.
Adaugă un buton „+ Adaugă lead în {stadiu}" în empty state-ul fiecărei coloane, care deschide
`CreateLeadModal` cu stadiul precompletat.

---

## In scope

- Empty state per coloană: pe lângă „Trage aici", buton „+ Adaugă în {label}".
- `CreateLeadModal` acceptă `defaultStage` opțional; lead-ul nou se creează direct în acel stadiu.
- Endpoint `createLead` acceptă/onorează `stage` (verifică suport; adaugă dacă lipsește).

## Out of scope

- Adăugare inline (fără modal) — rămâne modalul.

---

## User stories

- **US-1**: Ca agent, vreau să adaug un lead direct într-un stadiu (ex. „Trial") fără să-l mut după creare.

---

## Acceptance criteria

- [ ] AC1: Fiecare coloană goală afișează buton „+ Adaugă în {label}".
- [ ] AC2: Click deschide `CreateLeadModal` cu stadiul precompletat la acel `stage`.
- [ ] AC3: La salvare, lead-ul apare în coloana corectă (nu în „new").
- [ ] AC4: Coloanele cu lead-uri nu afișează butonul redundant (rămâne „Adaugă lead" global).
- [ ] AC5: 0 axe critical/serious; dark mode; zero `any`; touch target ≥ 44px.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — empty column + CreateLeadModal `defaultStage`
- `server/routes/leads.ts` — onorare `stage` la create (dacă lipsește)

### New
- `src/__tests__/crm/add-lead-empty-column.test.tsx`

---

## Tests

- **T-CRM-141-1** `[blocant]` Given coloană goală „Trial", Then există buton „+ Adaugă în Trial".
- **T-CRM-141-2** `[blocant]` Given click pe el, Then `CreateLeadModal` primește `defaultStage="trial"`.
- **T-CRM-141-3** `[blocant]` API smoke: `POST /api/leads` cu `stage:"trial"` → lead în stadiul trial.

---

## Definition of Done

- [ ] AC-uri; T-CRM-141-1..3 trec; build+typecheck+lint+test verzi
- [ ] Migration/API smoke verzi dacă schema atinsă; Reviewer APPROVED; persona reports; PR; STATE.json + BACKLOG.md
