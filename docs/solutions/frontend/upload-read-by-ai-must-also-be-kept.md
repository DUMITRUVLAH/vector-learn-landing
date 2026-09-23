---
title: Un act încărcat doar ca să-l citească AI-ul pare „neîncărcat" — păstrează-l și confirmă-l
problem_type: ux / data-loss
module: PAR (ParCreateForm — patenta beneficiarului; PATCH /api/par/:id — snapshotul din registru)
tags: [upload, ai, patenta, confirmare, snapshot, registru, par]
symptoms: "«La atașarea patentei trebuie bifă sau confirmare că s-a încărcat — acum pui, dar nu e clar dacă s-a pus sau nu»"
severity: medium
date: 2026-09-23
---

## Simptom

În formularul PAR, „Încarcă patenta" completa seria și termenul patentei, apoi nu mai lăsa nicio
urmă: niciun nume de fișier, nicio bifă, nimic de deschis. Owner-ul nu putea spune dacă actul
„s-a pus". Iar la următoarea cerere către aceeași persoană, patenta trebuia cerută din nou.

## Cauza

Butonul trimitea fișierul **doar** la `POST /api/par/ai-prefill/payee-doc`, care îl citește și
întoarce câmpurile. Fișierul nu se salva nicăieri. Confirmarea citirii („Am completat: seria
patentei…") apărea în cutia de acte de SUS, nu lângă butonul apăsat — deci nici ea nu se vedea.

Pe drum a ieșit și un al doilea bug, mai scump: formularul trimite `vendor_id` la **fiecare**
salvare, iar `PATCH /api/par/:id` rescria de fiecare dată seria și termenul patentei cu cele din
registru. Cine încărca patenta prelungită pentru un beneficiar salvat vedea termenul nou în
formular, dar cererea se salva cu cel vechi — și aprobatorul primea „patenta a EXPIRAT".

## Rezolvarea

- Copia patentei se păstrează: upload direct în Storage (`/api/par/:id/payee-patent/sign|finalize`,
  același drum ca atașamentele), coloane `payee_patent_file_*` pe cerere și `patent_file_*` pe
  beneficiar (migrarea 0188 + heal în sync-schema).
- Rândul cu bifă (`PatentFileRow`) apare **doar după** ce serverul a confirmat fișierul, cu nume,
  mărime, dată și „Deschide" (vizualizatorul din aplicație). Cât urcă, rândul „Se încarcă…" îi ține
  locul. Mesajele citirii AI apar lângă câmpurile patentei.
- La trimitere, copia trece în registru dacă e cel puțin la fel de nouă (`vendorAutoSave`); cererea
  următoare o preia prin `payee_patent_file: { from_vendor }` și o deschide pe loc.
- Câmpurile patentei trimise explicit câștigă în fața snapshotului din registru.
- Rutele noi care servesc copia (`/api/par/:id/payee-patent`, `/api/par/vendors/:id/patent`) sunt în
  `FRAMEABLE_BY_US` (server/middleware/securityHeaders.ts): fără asta, vizualizatorul arăta
  „refused to connect". Orice rută nouă deschisă în vizualizator trebuie adăugată acolo.

## Regula

**Un fișier pe care omul îl „încarcă" trebuie să rămână undeva și să se vadă că a rămas.** Dacă un
upload există doar ca să hrănească o extracție AI, spune-o explicit în UI („citesc actul, nu îl
păstrez") — altfel omul presupune că actul e la dosar. Confirmarea stă lângă butonul apăsat.

**Un snapshot din registru nu are voie să rescrie ce a trimis omul explicit** în același corp:
registrul completează ce lipsește, nu suprascrie ce se vede pe ecran.

Testele: `server/__tests__/par-payee-patent.routes.test.ts` (urcare, deschidere, GDPR, registru,
regresia termenului rescris) și secțiunea 2b din `scripts/e2e-par-patenta.mjs`.
