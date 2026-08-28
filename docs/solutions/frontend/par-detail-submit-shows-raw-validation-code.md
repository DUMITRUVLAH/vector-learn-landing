---
title: „Trimite spre aprobare" pe pagina de detaliu afișa doar codul brut „validation_failed"
problem_type: frontend
module: par
tags: [par, validare, mesaje-eroare, i18n, ux, detaliu-cerere, dead-end]
symptoms: 'Banda roșie din „Acțiuni disponibile" conținea textul „validation_failed" și nimic altceva; o ciornă se trimitea, alta nu, fără nicio explicație'
severity: P1
date: 2026-08-28
---

## Symptom
Violeta Bordeniuc (workspace **ATIC**, proiect **Digital Safeguard**) nu putea trimite ciorna
`PAR-2026-0004`: la apăsarea butonului apărea banda roșie cu textul `validation_failed`. O altă
cerere a ei (`PAR-2026-0003`) trecea fără probleme — de unde întrebarea „da cum un PAR merge și
altul nu? de ce așa?". Din interfață nu exista nicio cale de a afla ce lipsește.

## Root cause
Două locuri diferite apasă același endpoint și doar unul traducea răspunsul:

- `POST /api/par/:id/submit` răspunde `{ error: "validation_failed", errors: [{field, message}] }`
  (`server/lib/par/submit.ts` → `validateParForSubmit`).
- `ParCreateForm` avea un `FIELD_MESSAGES` local și mapa `e.details` pe câmpuri → mesaje în română.
- `ParDetail` (`ActionPanel.doSubmit`) făcea doar `setError(e.message)`. Iar `ApiError.message`
  este **codul** (`super(message ?? code)`), deci utilizatorul vedea `validation_failed`, în timp
  ce motivele reale existau în `e.details` și erau aruncate.

În cazul concret, ciorna avea articol și total (23.402,00 MDL) dar `end_use = null` și niciun
beneficiar (`vendor_id`, `payee_name`, `payee_iban` toate nule) — două erori de validare pe care
pagina nu le arăta. Cererea care „mergea" avea și scop, și furnizor salvat cu IBAN.

## Fix
- `src/lib/par/submitErrors.ts` — o singură sursă pentru mesajele pe câmp (`PAR_FIELD_MESSAGES`) +
  `describeParSubmitError(e)` care întoarce sumar + listă de motive; `ParCreateForm` o refolosește
  în loc de copia locală.
- `ParDetail` afișează lista de motive sub bandă și un link „Deschide cererea pentru completare"
  spre `/business/par/:id/edit`, ca drumul să nu se închidă în ecranul de eroare.

## Lesson
Un cod de eroare tehnic nu are ce căuta în interfață. Când un endpoint întoarce erori pe câmpuri,
**fiecare** ecran care îl apelează trebuie să le traducă — nu doar cel unde a fost scrisă prima
dată mapa. Mesajele stau într-un modul comun, altfel al doilea apelant repetă exact acest bug.

## Regression test
`src/pages/par/__tests__/ParDetail.submitErrors.test.tsx` — apasă butonul real, mock-ul respinge cu
`ApiError(400, "validation_failed", …, details)` și verifică ambele motive în română + absența
codului brut. Pică pe codul vechi, trece pe cel nou.
