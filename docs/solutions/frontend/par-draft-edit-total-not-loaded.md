---
title: O ciornă PAR salvată nu mai putea fi trimisă — formularul de editare încărca articolele, dar nu și totalul
problem_type: frontend
module: par
tags: [par, ciornă, formular, validare, stare-react, edit, total, dead-end]
symptoms: 'La „Trimite pentru aprobare" pe o ciornă redeschisă: „Adaugă cel puțin un articol în secțiunea «Articole» (totalul trebuie să fie > 0)" — deși articolele se vedeau în tabel'
severity: P1
date: 2026-08-26
---

## Symptom
„Salvez ciorna acum, o trimit mâine" era un drum înfundat. La redeschidere (`/business/par/:id/edit`)
articolele apăreau corect în tabelul §10, dar „TOTAL ESTIMAT" arăta `0,00 L`, iar apăsarea butonului
de trimitere răspundea cu „Adaugă cel puțin un articol…". Nu exista nicio cale de ieșire din
interfață: singura soluție era ștergerea ciornei și retastarea ei.

## Root cause
Blocul care încarcă o cerere existentă în `ParCreateForm` seta `setLineItems(existing.line_items)`
dar nu și `setTotalCents(...)` / `setAboveThreshold(...)`. Totalul e calculat pe server
(`recalcParTotal`) și trimis în răspuns — formularul nu-l recalculează din linii, îl primește. Cum
`clientValidate()` se uită la `totalCents <= 0`, starea rămasă la 0 respingea o ciornă perfect validă.

Tabelul de articole citea `lineItems` (corect încărcat), deci ecranul arăta „am articole", iar
validarea citea `totalCents` (rămas 0) — două surse de adevăr pentru aceeași întrebare.

## Fix
`setTotalCents(existing.totalEstimatedCents ?? 0)` + `setAboveThreshold(!!existing.above_micro_threshold)`
în același bloc de încărcare.

## How to avoid next time
Când un ecran încarcă o entitate existentă, verifică fiecare `useState` care participă la validare,
nu doar pe cele care se văd. Un câmp derivat pe server (total, prag, contor) trebuie hidratat explicit
la load — altfel formularul „nou" și formularul „editează" se comportă diferit exact acolo unde
utilizatorul nu se așteaptă.

Testul care îl prinde: `src/pages/par/__tests__/ParCreateForm.editDraft.test.tsx` (pică pe codul
vechi, trece pe cel nou) + parcursul 02 din `scripts/e2e-par-journeys.mjs`, care salvează o ciornă,
o regăsește în listă, o redeschide și o trimite — adică drumul real al omului, nu doar randarea.
