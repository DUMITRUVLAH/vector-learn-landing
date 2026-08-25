---
title: A DOM API jsdom lacks aborts the handler mid-way — the test still passes
problem_type: false-green-test
module: vitest setup, ParCreateForm
tags: [testing, jsdom, vitest, scrollIntoView, false-positive, unhandled-rejection]
symptoms: "Vitest: «Errors 1» alături de «Tests 391 passed»; TypeError: x.scrollIntoView is not a function"
severity: high
date: 2026-08-25
---

## Symptom

Suita raportează **toate testele verzi** și, separat, o linie ușor de sărit:

```
 Test Files  41 passed (41)
      Tests  391 passed (391)
     Errors  1 error        ← ăsta
```

Detaliul:

```
Unhandled Rejection
TypeError: summaryRef.current?.scrollIntoView is not a function
 ❯ submit src/pages/par/ParCreateForm.tsx:1087:27
```

## Root cause

jsdom **nu implementează** `Element.prototype.scrollIntoView` (nici `scrollTo`,
`IntersectionObserver`, `matchMedia`) — deși există în orice browser real. Apelul aruncă,
iar excepția nu iese la suprafață ca eșec de test: pică în mijlocul unui handler `async`,
deci **restul handler-ului nu mai rulează**, iar respingerea rămâne neprinsă.

Rezultatul e cel mai prost tip de test: verde, dar care nu a executat decât jumătate din
acțiunea pe care pretinde că o verifică. Aici testul „cererea PLEACĂ la a doua apăsare"
trecea fără să ajungă vreodată la partea de trimitere.

## Fix

Stub în `src/test/setup.ts`, nu gard defensiv în cod de producție — codul e corect, golul
e în mediul de test:

```ts
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
```

## Lecția generală

1. **`Errors: N` lângă `Tests: all passed` nu e zgomot** — e semnalul că un handler a murit
   la jumătate. Tratează-l ca eșec, nu ca avertisment.
2. Când un test „trece" pentru o acțiune (submit, upload, generare), verifică faptul că
   acțiunea chiar s-a **consumat până la capăt** (a fost apelat endpoint-ul? s-a schimbat
   starea?), nu doar că nu a explodat nimic — vezi CLAUDE.md §3.5.1quater, „testează
   ACȚIUNEA, nu butonul".
3. Orice API de DOM absent în jsdom se stub-uiește o singură dată, central, în setup —
   altfel reapare la fiecare pagină nouă care derulează, observă sau interoghează media queries.
