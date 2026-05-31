---
id: CRM-132
title: "Timeline filters — filtrare activitate după tip (notă/apel/email/stadiu)"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-131]
slug: timeline-filters
---

## Goal

Timeline-ul de activitate pe cartonaș (`LeadCardPage.tsx` tab Activitate) conține zeci de
intrări de tipuri diferite. Utilizatorii vor să filtreze rapid:
„arată-mi doar apelurile" sau „arată-mi doar schimbările de stadiu".

Adaugă un row de filtre deasupra timeline-ului care permite vizualizarea selectivă.

---

## In scope

- Rând de butoane filtru deasupra timeline-ului în tab Activitate:
  - **Toate** (implicit selectat — afișează tot)
  - **Note** (type=note)
  - **Apeluri** (type=call)
  - **Email/WA/SMS** (type=email | whatsapp | sms)
  - **Stadiu** (type=stage_change)
- Filtrul este local (client-side, pe `interactions` state existent — nu noi API calls)
- Buton activ are border-primary + bg-primary/10
- Numărul de intrări din fiecare categorie apare în badge-ul butonului (ex: „Apeluri (3)")
- La activare filtru, timeline-ul re-renderează imediat cu intrările filtrate
- Dacă un filtru activ returnează 0 rezultate — se afișează empty state „Nicio intrare de tipul selectat."
- Filtrul este reset la navigare tab (dacă utilizatorul schimbă tab-ul și revine → Toate)

## Out of scope

- Filtrare server-side / paginare
- Căutare full-text în body
- Filtre combinate (AND between types)
- Export timeline

---

## User stories

- **US-1**: Ca vânzător, vreau să văd doar apelurile mele cu un click ca să verific ce am discutat.
- **US-2**: Ca manager, vreau să văd schimbările de stadiu rapid ca să înțeleg istoricul leadului.
- **US-3**: Ca utilizator, dacă filtrele sunt active și nu există intrări, vreau un mesaj clar.

---

## Acceptance criteria

- [ ] AC1: Rândul de filtre apare deasupra timeline-ului în tab Activitate cu butoane: Toate / Note / Apeluri / Email+WA+SMS / Stadiu.
- [ ] AC2: Fiecare buton arată numărul intrărilor din categoria sa (badge număr).
- [ ] AC3: Click pe buton activ → timeline afișează doar intrările din categoria respectivă.
- [ ] AC4: Buton activ are stil distinctiv față de cele inactive (border-primary, text-primary).
- [ ] AC5: Filtrul „Toate" selectat → toate intrările vizibile (comportamentul implicit).
- [ ] AC6: Filtru activ cu 0 rezultate → empty state „Nicio intrare de tipul selectat."
- [ ] AC7: Intrările optimiste (CRM-131) apar indiferent de filtru (nu sunt filtrate afară).
- [ ] AC8: 0 axe critical/serious; dark mode OK; fără hardcoded hex.

---

## Files

### Modified
- `src/pages/app/LeadCardPage.tsx` — adaugă TimelineFilters component + logică filtrare

### New
- `src/components/crm/TimelineFilters.tsx` — rând de filtre cu butoane
- `src/__tests__/crm/timeline-filters.test.tsx` — unit tests

---

## Tests

- **T-CRM-132-1** `[blocant]` Given `TimelineFilters` randat cu counts `{all:5, note:2, call:1, commChannel:1, stage_change:1}`, Then 5 butoane vizibile cu numerele corecte.
- **T-CRM-132-2** `[blocant]` Given filtru "Apeluri" selectat și interactions cu 1 call + 2 notes, When render, Then doar 1 item vizibil în timeline.
- **T-CRM-132-3** `[blocant]` Given filtru "Note" cu 0 note, Then textul „Nicio intrare de tipul selectat" vizibil.
- **T-CRM-132-4** Given filtru activ e "Apeluri", When click pe "Toate", Then toate interacțiunile revin vizibile.

---

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] T-CRM-132-1..4 trec
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` — verzi
- [ ] 0 axe violations critical/serious
- [ ] Dark mode OK
- [ ] Reviewer APPROVED; persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
