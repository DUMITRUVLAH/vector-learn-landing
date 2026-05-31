---
id: DIPLOMA-804
title: "Diplome: generare bulk pe toată cohorta + download ZIP — portat din copy-roas"
milestone: DIPLOMA
phase: 1
status: pending
depends_on: [DIPLOMA-803]
slug: bulk-zip
---

## Goal

Portează generarea în masă: pentru toți participanții selectați ai cohortei, emite certificatele,
randează fiecare (PDF sau JPG), le împachetează într-un **ZIP** descărcabil. Din
`handleGenerateAll("download")` în copy-roas.

## Idei de cod trase din copy-roas

`src/pages/DiplomaGenerator.tsx` → `handleGenerateAll`:
- Construiește `certRecords` pentru toți `activeParticipants` (selectați prin checkbox), deduplică pe
  `certificate_id`, face **un singur upsert** în `issued_certificates` cu `.select(certificate_id,
  verification_token)` → `tokenMap`. Portează ca `POST /api/certificates/issue-bulk` care primește
  cohortId + lista de nume/indici și întoarce `[{certificateId, token}]`.
- Loop: pentru fiecare participant, `generateCertificateCanvas/Pdf` cu tokenul corespunzător,
  adaugă în `JSZip` (`zip.file(fileName, blob)`). Nume fișier: `Certificat_{n}_{Nume}.{ext}`
  (`buildCertificateFileName`, curăță caractere invalide). Portează.
- La final `zip.generateAsync({type:'blob'})` → download `Certificate_{curs}_{ediție}.zip`.
- Selecție participanți: checkbox-uri „Selectează toți / Deselectează toți", badge `N/M selectați`.

## In scope

- Selecția multi-participant (checkbox-uri + select all) în `DiplomaPage` secțiunea 3.
- `POST /api/certificates/issue-bulk` tenant-safe (un singur round-trip, dedup pe certificateId).
- Client: loop randare + `JSZip` → download ZIP. Dependință `jszip` (justificată).
- Progres vizual la generare (spinner + count „Se generează N certificate…").
- Buton „Descarcă Toate (N) — ZIP (PDF/JPG)".

## Out of scope

- Sync Google Drive (lăsat pentru o fază viitoare / out of scope acum — copy-roas îl are prin
  `sync-certificates-drive` + OAuth Google; notează în „Backlog descoperit" ca DIPLOMA-806 potențial).
- Pagina publică de verificare (DIPLOMA-805).

## User stories

- **US-1**: Ca manager, la finalul cohortei vreau să generez toate diplomele odată și să le descarc
  într-un ZIP.
- **US-2**: Ca manager, vreau să bifez doar o parte din cursanți (ex. doar cei care au absolvit).

## Acceptance criteria

- [ ] AC1: Bulk issue face un singur upsert pentru N participanți, întoarce N tokenuri unice.
- [ ] AC2: ZIP conține N fișiere cu nume `Certificat_{n}_{Nume}.{pdf|jpg}`, caractere invalide curățate.
- [ ] AC3: Select all / deselect all + badge count corect; doar bifații intră în ZIP.
- [ ] AC4: Progres afișat; nu blochează UI-ul ireversibil la eroare.
- [ ] AC5: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/routes/certificatesIssueBulk.ts` (sau extinde ruta existentă)
- `src/lib/certificateZip.ts` (`buildCertificateFileName`, împachetare ZIP)
- `src/__tests__/diploma/bulk-zip.test.tsx`
- `server/__tests__/certificates-bulk.routes.test.ts`

### Modified
- `src/pages/app/DiplomaPage.tsx`
- `package.json` (`jszip`, justificat)

## Tests

- **T-DIPLOMA-804-1** `[blocant]` Bulk pe 3 selectați → 3 rânduri issued, 3 tokenuri unice, 1 request.
- **T-DIPLOMA-804-2** `[blocant]` `buildCertificateFileName("Ion/Pop:1")` curăță `/` `:` → nume valid.
- **T-DIPLOMA-804-3** `[blocant]` Deselectez 1 din 3 → ZIP are 2 fișiere.

## Definition of Done

- [ ] AC-uri; T-DIPLOMA-804-1..3 trec; build+typecheck+lint+test verzi
- [ ] API smoke + portability verzi (§3.5.1)
