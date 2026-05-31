---
id: CRM-137
title: "Selector responsabil cu nume (înlocuiește input UUID) — peste tot în CRM"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-111]
slug: assignee-picker
---

## Goal

Astăzi asignarea responsabilului se face lipind un **UUID** manual: pe cartonaș
([LeadCardPage.tsx:646-653](../../src/pages/app/LeadCardPage.tsx#L646-L653)), în modalul de
creare ([LeadsPage.tsx:1598-1601](../../src/pages/app/LeadsPage.tsx#L1598-L1601)) și în
bulk-assign ([LeadsPage.tsx:1257-1265](../../src/pages/app/LeadsPage.tsx#L1257-L1265)). Niciun
om real nu cunoaște UUID-ul colegului. La fel, filtrul „responsabil" din kanban are doar
`Toți` / `Neasignat` ([LeadsPage.tsx:388-389](../../src/pages/app/LeadsPage.tsx#L388-L389)) —
nu poți filtra după o persoană anume.

Înlocuiește toate cele 4 locuri cu un **dropdown cu numele membrilor echipei** (nume + inițiale/avatar),
alimentat dintr-un endpoint de membri tenant.

---

## In scope

- Endpoint `GET /api/team/members` → `[{ id, fullName, email, role }]` (tenant-scoped, doar
  utilizatorii activi ai tenantului). Reutilizează tabelul de utilizatori existent.
- Hook `useTeamMembers()` cu cache simplu (se încarcă o dată per sesiune).
- Componentă `AssigneePicker` reutilizabilă (`<select>` accesibil cu nume; opțiune „Neasignat").
- Înlocuire în: cartonaș (edit responsabil), CreateLeadModal, BulkActionToolbar (assign panel),
  filtrul „responsabil" din bara de filtre (populat cu membrii reali).
- Afișare nume responsabil în loc de „`uuid.slice(0,8)…`" în modul read pe cartonaș și pe card.

## Out of scope

- Gestionarea membrilor echipei (invitare/dezactivare) — modul HR separat.
- Round-robin auto-assign (CRM-135, deja livrat).

---

## User stories

- **US-1**: Ca agent, vreau să aleg responsabilul după nume dintr-o listă, nu să caut UUID-uri.
- **US-2**: Ca director, vreau să filtrez pipeline-ul după un membru anume al echipei.
- **US-3**: Ca utilizator, vreau să văd numele responsabilului pe card, nu un fragment de UUID.

---

## Acceptance criteria

- [ ] AC1: `GET /api/team/members` întoarce 200 cu membrii activi ai tenantului curent; alt tenant nu apare.
- [ ] AC2: `AssigneePicker` afișează numele complet al fiecărui membru + opțiunea „Neasignat".
- [ ] AC3: Pe cartonaș, în edit, responsabilul se alege din dropdown; valoarea salvată e UUID-ul corect.
- [ ] AC4: În read pe cartonaș și pe KanbanCard, responsabilul se afișează cu nume (nu fragment UUID).
- [ ] AC5: Filtrul „responsabil" din bara de filtre listează membrii reali + „Toți" + „Neasignat" și filtrează corect.
- [ ] AC6: Bulk-assign folosește dropdown-ul cu nume; „— elimină —" dezasignează.
- [ ] AC7: 0 axe critical/serious; dark mode; no hardcoded hex; zero `any`; fiecare select are `<label>`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — assignee edit + read
- `src/pages/app/LeadsPage.tsx` — CreateLeadModal, BulkActionToolbar, filtru responsabil, KanbanCard read
- `server/routes/` — rută nouă team members (sau extinde una existentă)

### New
- `src/components/crm/AssigneePicker.tsx`
- `src/hooks/useTeamMembers.ts`
- `src/lib/api/team.ts`
- `src/__tests__/crm/assignee-picker.test.tsx`

---

## Tests

- **T-CRM-137-1** `[blocant]` Given membri mock, When `AssigneePicker` randat, Then afișează numele + „Neasignat".
- **T-CRM-137-2** `[blocant]` Given selectarea unui membru, Then `onChange` primește UUID-ul corect.
- **T-CRM-137-3** `[blocant]` Given lead cu `assignedTo` setat, Then cardul afișează numele membrului, nu UUID.
- **T-CRM-137-4** Given filtru responsabil = membru X, Then doar lead-urile lui X rămân vizibile.
- **T-CRM-137-5** `[blocant]` API smoke: login → `GET /api/team/members` → 200, tenant-scoped.

---

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] T-CRM-137-1..5 trec; build+typecheck+lint+test verzi
- [ ] Migration gate (dacă schema atinsă) + API smoke verzi — §3.5.1
- [ ] 0 axe critical/serious; dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate; PR deschis; STATE.json + BACKLOG.md actualizate
