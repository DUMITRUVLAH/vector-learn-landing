---
id: CRM-131
title: "Lead card UX polish — skeleton, optimistic UI, inline note edit, empty states"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-130]
slug: lead-card-ux-polish
---

## Goal

`LeadCardPage.tsx` este folosit zeci de ori pe zi. Patru îmbunătățiri de UX care elimină
frecarea vizibilă identificată în sesiunile de review:

1. **Loading skeletons** — în loc de spinner simplu, afișează skeleton cards pentru tab-ul
   Activitate și pentru panoul din stânga în timp ce datele se încarcă.
2. **Optimistic UI pe note** — nota adăugată apare instant în timeline (înainte de confirmarea
   serverului), cu stare „Se salvează..." și rollback cu toast de eroare dacă `POST` eșuează.
3. **Undo pe ștergere task** — la ștergerea unui task → toast cu timer 5s + buton „Anulează";
   dacă utilizatorul apasă „Anulează" înainte de 5s → `PUT /api/lead-tasks/:id` restore;
   altfel → `DELETE` efectiv după 5s.
4. **Empty state copy** — fiecare tab gol are un ilustru minimal + text motivant:
   - Tab Activitate gol: „Nicio activitate încă. Adaugă o notă sau înregistrează un apel."
   - Tab Task-uri gol: „Nicio sarcină. Adaugă un reminder ca să nu uiți."
   - Tab Fișiere gol: „Niciun document. Încarcă un contract sau CI."
   - Tab GDPR: afișează data consimțământului sau „Consimțământ nelogat" cu buton „Loghează".

---

## In scope

- Skeleton component `src/components/crm/LeadCardSkeleton.tsx` — 2 blocuri dreptunghiulare animate pentru panoul stânga + 3 skeleton rows pentru timeline
- Optimistic insert în `interactions` state — nota apare imediat cu `id: 'optimistic-<timestamp>'`, `occurredAt: now()`; la confirmare se înlocuiește cu răspunsul real; la eroare se elimină + toast
- Undo task delete — `useUndoableDelete` hook; stochează taskul în `pendingDelete` ref cu timer; toast cu countdown sau buton „Anulează"
- Empty states per tab (4 variante, text minimal, fără imagini externe)
- Tooltip pe butonul „Sună" cu numărul de telefon format

## Out of scope

- Optimistic drag în kanban (CRM-130)
- @mentions (CRM-132)
- Print view (CRM-133)

---

## User stories

- **US-1**: Ca recepționer, vreau să văd instant nota mea adăugată (fără să aștept serverul) ca să nu fiu blocat.
- **US-2**: Ca manager, dacă șterg accidental un task, vreau 5 secunde să anulez greșeala.
- **US-3**: Ca utilizator nou pe un lead fără activitate, vreau un text clar care să mă ghideze ce să fac.

---

## Acceptance criteria

- [ ] AC1: Cât timp `lead === null` (fetch în curs), pagina afișează `LeadCardSkeleton` în loc de spinner Loader2 gol.
- [ ] AC2: La submit nota (`+ Notă`), nota apare imediat în timeline cu indicator „Se salvează..." (italic sau opacity-60).
- [ ] AC3: Dacă `POST /api/leads/:id/interactions` eșuează, nota optimistă dispare și apare toast eroare „Nu s-a salvat nota — încearcă din nou".
- [ ] AC4: La confirmare server, nota optimistă e înlocuită cu răspunsul real (ID real, timestamp real).
- [ ] AC5: La click „Șterge task", taskul dispare vizual imediat + toast „Task șters · Anulează (5s)".
- [ ] AC6: Dacă utilizatorul apasă „Anulează" în 5s, taskul reapare; `DELETE /api/lead-tasks/:id` NU e apelat.
- [ ] AC7: Dacă nu se apasă „Anulează" în 5s, `DELETE /api/lead-tasks/:id` e apelat o singură dată.
- [ ] AC8: Tab Activitate gol → text „Nicio activitate încă. Adaugă o notă sau înregistrează un apel." + icon `MessageSquare`.
- [ ] AC9: Tab Task-uri gol → text „Nicio sarcină. Adaugă un reminder ca să nu uiți." + icon `CheckSquare`.
- [ ] AC10: Tab Fișiere gol → text „Niciun document. Încarcă un contract sau CI." + icon `FileText`.
- [ ] AC11: 0 axe critical/serious; dark mode; no hardcoded hex; zero `any`.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — integrate skeleton, optimistic note, undo task delete, empty states

### New
- `src/components/crm/LeadCardSkeleton.tsx` — skeleton component
- `src/hooks/useUndoableDelete.ts` — generic undo hook
- `src/__tests__/crm/lead-card-ux-polish.test.tsx` — unit tests

---

## Tests

- **T-CRM-131-1** `[blocant]` Given `LeadCardSkeleton` randat, Then conține elemente cu clasa `animate-pulse` (nu Loader2).
- **T-CRM-131-2** `[blocant]` Given submit notă cu mock `addInteraction` care rezolvă după delay, When submit, Then nota apare imediat cu text „Se salvează..."; după rezolvare, nota nu mai are indicatorul.
- **T-CRM-131-3** `[blocant]` Given submit notă cu mock `addInteraction` care rejectează, Then nota optimistă dispare din lista; toast eroare afișat.
- **T-CRM-131-4** `[blocant]` Given `useUndoableDelete` cu delay 5000ms, When cancel în 100ms, Then callback delete NU e apelat.
- **T-CRM-131-5** Given `useUndoableDelete` fără cancel, Then callback delete e apelat după delay.
- **T-CRM-131-6** `[blocant]` Given tab Activitate cu 0 interacțiuni, Then conține textul „Nicio activitate încă".
- **T-CRM-131-7** Given tab Task-uri cu 0 task-uri, Then conține textul „Nicio sarcină".

---

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] T-CRM-131-1..7 trec
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` — verzi
- [ ] 0 axe violations critical/serious
- [ ] Dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
