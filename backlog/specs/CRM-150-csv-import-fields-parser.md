---
id: CRM-150
title: "Import CSV: mapare valoare/companie/tag + parser robust (ghilimele, virgule)"
milestone: CRM
phase: J
status: pending
depends_on: [CRM-103, CRM-113, CRM-115]
slug: csv-import-fields-parser
---

## Goal

Importul CSV mapează doar 5 câmpuri (`OUR_FIELDS`
[LeadsPage.tsx:1636-1642](../../src/pages/app/LeadsPage.tsx#L1636-L1642)) — lipsesc **valoarea
deal-ului** (esențială pentru forecast), compania și tag-urile. În plus, parserul naiv pe `,`
([LeadsPage.tsx:1651](../../src/pages/app/LeadsPage.tsx#L1651)) rupe orice CSV cu virgule în câmpuri
(„S.R.L. Acme, Cluj") sau cu newline în ghilimele. Extinde maparea și înlocuiește parserul cu unul
care respectă RFC 4180 (ghilimele, escape, virgule interne).

---

## In scope

- Adaugă câmpuri mapabile: `valueCents` (din „valoare"/„value" — parse euro→cents), `company`, `tags`
  (split pe `;` sau `,` în interiorul valorii), `assignedTo` (opțional, după nume via picker CRM-137).
- Parser CSV corect (ghilimele duble, escaping `""`, virgule și newline în câmpuri citate).
  Preferă o util mică testată în loc de `split(",")`.
- Backend `POST /api/leads/import` onorează noile câmpuri (value/company/tags) în dryRun + commit.
- Preview afișează coloanele noi.

## Out of scope

- Import xlsx (doar CSV).
- Auto-detect encoding (presupune UTF-8).

---

## User stories

- **US-1**: Ca director, vreau ca importul să aducă și valoarea deal-ului, ca forecast-ul să fie corect.
- **US-2**: Ca utilizator, vreau ca un CSV cu „Acme, SRL" în câmp să nu se spargă pe coloane.

---

## Acceptance criteria

- [ ] AC1: Maparea oferă `valoare`, `companie`, `tag-uri` pe lângă cele 5 existente.
- [ ] AC2: O linie `"Acme, SRL",+40...` se parsează ca un singur câmp companie (virgula internă păstrată).
- [ ] AC3: Câmpul valoare „360" / „360,50" → `valueCents` corect (36000 / 36050).
- [ ] AC4: Tag-urile importate apar pe lead (split corect).
- [ ] AC5: dryRun preview și commit reflectă câmpurile noi; backend le persistă.
- [ ] AC6: 0 axe critical/serious; zero `any`; testul de parser acoperă ghilimele + virgule + newline.

---

## Files

### Modified
- `src/pages/app/LeadsPage.tsx` — CsvImportModal (OUR_FIELDS + parser + preview)
- `server/routes/leads.ts` — import onorează value/company/tags

### New
- `src/lib/csv.ts` (parser RFC 4180 minimal) + `src/lib/__tests__/csv.test.ts`
- `src/__tests__/crm/csv-import-fields.test.tsx`

---

## Tests

- **T-CRM-150-1** `[blocant]` Given `"Acme, SRL",x` parser, Then câmp[0]="Acme, SRL".
- **T-CRM-150-2** `[blocant]` Given câmp citat cu newline intern, Then nu se sparge pe rânduri.
- **T-CRM-150-3** `[blocant]` Given valoare „360,50", Then `valueCents=36050`.
- **T-CRM-150-4** `[blocant]` API smoke: import cu value+company → lead-uri create cu acele câmpuri.

---

## Definition of Done

- [ ] AC-uri; T-CRM-150-1..4 trec; build+typecheck+lint+test verzi
- [ ] Migration/API smoke verzi; DB-portability (fără `.execute().rows`); Reviewer APPROVED (diff risc → adversarial); persona reports; PR; STATE.json + BACKLOG.md
