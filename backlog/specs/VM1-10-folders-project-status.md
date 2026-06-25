---
id: VM1-10
title: "Foldere PAR — ierarhie Proiect → status (De aprobat / Aprobate / Plătite)"
milestone: VIOLETA
phase: "VIOLETA"
status: pending
attempts: 0
depends_on: [VM1-04]
spec: backlog/specs/VM1-10-folders-project-status.md
core: backlog/par/PAR-CORE.md
---

## Goal

Vizualizare pe foldere a cererilor PAR cu ierarhia Proiect → status. Alegi un proiect și vezi folderele
lui: „De aprobat" (pending_approval), „Aprobate" (approved + in_finance) și „Plătite" (paid), fiecare cu
count și total convertit în MDL (reutilizând VM1-03). Există și bucket „Fără proiect". Marcarea „Plătit"
din fluxul existent de plată mută o cerere din „Aprobate" → „Plătite". E în principal un strat de UI și
agregare peste statusurile existente; opțional, dacă VM1-04 e prezent, se poate adăuga nivelul
Proiect → Eveniment → status.

## User stories

- **Ca** finance, **vreau** să văd cererile organizate pe proiect și apoi pe status, **pentru că** lucrez
  proiect cu proiect și vreau să știu ce e de plătit.
- **Ca** Andreea (director), **vreau** totaluri per proiect în MDL, **pentru că** vreau o privire de
  ansamblu pe fiecare proiect.
- **Ca** finance, **vreau** ca marcarea „Plătit" să mute cererea în folderul „Plătite", **pentru că**
  reflectă imediat realitatea.

## Acceptance criteria

- [ ] Vedere „Foldere" în secțiunea PAR: listă de proiecte, fiecare cu count total de cereri
- [ ] La selectarea unui proiect: 3 foldere — „De aprobat" (status `pending_approval`), „Aprobate" (`approved` + `in_finance`), „Plătite" (`paid`) — fiecare cu count
- [ ] Fiecare folder arată totalul convertit în MDL (reutilizează `totalMdlCents` din VM1-03), nu reconvertește din valuta brută
- [ ] Bucket „Fără proiect" pentru cererile cu `projectId = null`
- [ ] Marcarea „Plătit" prin fluxul EXISTENT de plată mută cererea din „Aprobate" în „Plătite" (fără cale de plată nouă)
- [ ] Click pe un folder duce la lista filtrată (refolosește filtrele existente din `ParDashboard`)
- [ ] Strat pur de UI/agregare peste statusurile existente — fără tabel nou, fără status nou
- [ ] Opțional, dacă VM1-04 prezent: sub-nivel Proiect → Eveniment → status (nesting), altfel doar Proiect → status
- [ ] Tenant scope respectat; fără hex hardcodat; dark-mode ok

## Files

**New:**
- `src/pages/par/ParFolders.tsx` (vederea pe foldere)
- teste `src/pages/par/__tests__/par-folders.test.tsx`

**Modified:**
- `src/components/business/BusinessShell.tsx` — intrare „Foldere" în navul PAR
- `src/pages/par/ParDashboard.tsx` — reutilizare filtre la click pe folder (dacă e necesar)
- `src/lib/api/par.ts` — helper agregare per proiect/status (dacă lipsește)

## Tests

- **T-VM1-10-1** [blocant] Given cereri în diverse statusuri pe 2 proiecte, When deschid Folderele și aleg un proiect, Then văd 3 foldere cu count-uri corecte
- **T-VM1-10-2** [blocant] Given o cerere „Aprobată", When o marchez „Plătit" prin fluxul existent, Then ea trece din „Aprobate" în „Plătite"
- **T-VM1-10-3** [normal] Given cereri în valute mixte într-un proiect, When văd totalul folderului, Then e suma în MDL din `totalMdlCents`
- **T-VM1-10-4** [normal] Given cereri cu `projectId=null`, When deschid Folderele, Then apar în bucket-ul „Fără proiect"

## DoD

- Live-smoke verde · reviewer APPROVED · personas salvate
