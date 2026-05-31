---
id: CRM-133
title: "Duplicate detection banner — alertă deduplicare proeminentă pe cartonașul lead"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-102, CRM-131]
slug: duplicate-detection-banner
---

## Goal

CRM-102 a implementat deduplicarea la adăugare (popup la crearea unui lead nou).
Dar un lead duplicat detectat mai târziu (ex: același număr de telefon e introdus de un
alt coleg) nu are nicio alertă pe cartonașul existent.

Adaugă un banner persistent pe `LeadCardPage.tsx` care verifică la mount dacă există un
lead cu același telefon sau email în altă etapă a pipeline-ului. Dacă da, afișează un
banner de avertizare cu link direct la cartonașul duplicat + buton „Fuzionează".

---

## In scope

- La mount-ul paginii LeadCardPage, dacă lead-ul are `phone` sau `email`, apelează
  `GET /api/leads/dedup-check?phone=…&email=…` care returnează potențialii duplicați
  (excluzând lead-ul curent și cei deja convertiți).
- Banner de avertizare (amber/warning) apare sub consent-revoked banner dacă există duplicați:
  - Textul: „Posibil duplicat: [Nume lead duplicat] · [Stadiu] · [Creat la data]"
  - Link „Vezi cartonașul" → navigare la `/app/leads/:duplicateId`
  - Buton „Fuzionează" → deschide `MergeLeadModal` (selectare lead de păstrat + lead de arhivat)
- `MergeLeadModal` — dialog simplu cu 2 opțiuni radio (keepCurrent / keepDuplicate),
  un summary al câmpurilor câștigătoare, + buton Confirmă.
  La confirmare: `POST /api/leads/:id/merge` cu `{ mergeWithId: string, keepId: string }`.
  Server: copiază interacțiunile + task-urile din lead-ul arhivat pe cel păstrat,
  marchează lead-ul arhivat ca `stage: 'archived'`, returnează lead-ul fuzionat.
- Bannner dispare după fuzionare reușită.
- Dacă `dedup-check` eșuează (server down) — se ignoră silențios (banner nu apare).
- Dacă `phone` și `email` sunt null — nu se face request.

## Out of scope

- Auto-merge (fuzionare automată fără confirmare umană)
- Fuzionare cu mai mult de 2 lead-uri deodată
- Dedup bazat pe nume (prea noise)
- Fuzionare din kanban (CRM-102 face dedup la adăugare; acesta e pentru detecție ulterioară)

---

## User stories

- **US-1**: Ca recepționer, dacă am introdus accidental un lead duplicat, vreau să văd un banner pe
  cartonașul lui care mă avertizează și mă lasă să fuzionez cu 2 clickuri.
- **US-2**: Ca manager, vreau ca istoricul (note + apeluri + task-uri) să fie păstrat după fuzionare.

---

## Acceptance criteria

- [ ] AC1: La mount, dacă lead-ul are phone/email, se apelează `GET /api/leads/dedup-check`.
- [ ] AC2: Dacă răspunsul include ≥1 duplicat, apare banner amber cu textul corect.
- [ ] AC3: Link „Vezi cartonașul" → navigare la `/app/leads/:duplicateId`.
- [ ] AC4: Buton „Fuzionează" → deschide `MergeLeadModal`.
- [ ] AC5: `MergeLeadModal` afișează 2 opțiuni radio (păstrează curent / păstrează duplicat) + câmpuri cheie.
- [ ] AC6: La confirmare → `POST /api/leads/:id/merge` apelat cu parametrii corecți; toast succes.
- [ ] AC7: Bannner dispare după fuzionare reușită.
- [ ] AC8: Dacă nu există duplicați sau lead nu are date de contact → banner nu apare.
- [ ] AC9: Dacă request-ul de dedup eșuează → banner nu apare (fail silențios).
- [ ] AC10: Server route `GET /api/leads/dedup-check` → returnează `{ duplicates: Lead[] }`.
- [ ] AC11: Server route `POST /api/leads/:id/merge` → copiază interactions + tasks, arhivează sursă.
- [ ] AC12: 0 axe critical/serious; dark mode; no hardcoded hex.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — adaugă `DuplicateBanner` + `MergeLeadModal`
- `server/routes/leads.ts` — adaugă `GET /dedup-check` + `POST /:id/merge`

### New
- `src/components/crm/MergeLeadModal.tsx` — dialog fuzionare
- `src/__tests__/crm/duplicate-detection-banner.test.tsx` — unit tests

---

## Tests

- **T-CRM-133-1** `[blocant]` Given `dedup-check` returnează 1 duplicat, Then banner cu textul „Posibil duplicat" e vizibil.
- **T-CRM-133-2** `[blocant]` Given `dedup-check` returnează `{ duplicates: [] }`, Then banner nu apare.
- **T-CRM-133-3** `[blocant]` Given `dedup-check` eșuează (reject), Then banner nu apare.
- **T-CRM-133-4** `[blocant]` Given click „Fuzionează", Then `MergeLeadModal` se deschide cu 2 opțiuni radio.
- **T-CRM-133-5** Given confirmare merge, Then `POST /api/leads/:id/merge` e apelat o singură dată cu parametrii corecți.

---

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] T-CRM-133-1..5 trec
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` — verzi
- [ ] Migration gate: nu sunt necesare migrații noi (merge e logic-only la nivel DB)
- [ ] 0 axe violations critical/serious
- [ ] Dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
