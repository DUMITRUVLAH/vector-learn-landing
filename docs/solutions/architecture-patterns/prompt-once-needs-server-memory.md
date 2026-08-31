---
title: „Iar m-am logat și mi-a apărut" — o întrebare care se pune „o singură dată" nu poate ține minte în localStorage
problem_type: architecture_pattern
module: par-vendor360, par-ratings
tags: [ux, localStorage, sessionStorage, idempotency, popup, prompt, cross-device]
symptoms: popup-ul de evaluare reapare după o autentificare nouă / pe alt calculator / în fereastră privată, deși fusese închis
severity: P2
date: 2026-08-31
---

## Simptom
Owner-ul a raportat de DOUĂ ori aceeași senzație: „mereu mă întreabă de la ultimul PAR" (dimineața),
apoi „iar m-am logat și mi-a apărut să dau feedback — trebuie doar o dată, și gata" (seara), deși
între cele două rapoarte fusese livrat un fix.

## Cauză
Primul fix mutase urma („l-am întrebat deja despre cererea asta") din „doar la apăsarea pe «Mai
târziu»" în `localStorage`, la deschiderea dialogului. Corect ca gest, insuficient ca **loc**:

- `localStorage` e legat de origine + profil de browser. Alt calculator, altă filă privată, stocare
  curățată, un login pe telefon → memoria e goală, deci întrebarea se pune din nou;
- iar regula „cel mult una pe zi" transformase o singură întrebare enervantă într-un **flux** de
  întrebări: cine avea zeci de plăți neevaluate primea alt popup în fiecare zi. Din interiorul
  produsului arăta ca respectarea regulii; din partea omului arăta exact ca bug-ul inițial.

## Regula
**Dacă promisiunea făcută omului este „o singură dată", starea trebuie să stea acolo unde omul e
recunoscut — pe server, legată de contul lui — nu în browserul de pe care s-a nimerit să apese.**
Stocarea din browser rămâne utilă ca gardă instantanee (între deschiderea dialogului și confirmarea
de la server, sau offline), dar nu poate fi singura sursă de adevăr.

Concret, în PAR: `par_requests.rating_prompted_at` (migrarea `0155`), scris de
`POST /api/par/vendors/pending-ratings/asked` **în momentul deschiderii** popup-ului, iar
`GET /pending-ratings` sare peste cererile marcate. Marcarea e idempotentă (`IS NULL` în WHERE) și
scrie doar pe cererile proprii — nimeni nu poate stinge întrebarea altcuiva.

Pe lângă asta, două limite care țin promisiunea și când memoria e goală:
- **una pe sesiune** (`sessionStorage`) — cinci plăți neevaluate nu produc cinci popup-uri;
- **fereastră de prospețime** (14 zile de la plată) — o coadă de plăți vechi nu mai declanșează
  nimic; ele rămân evaluabile din fișa furnizorului, unde există buton pe fiecare cerere plătită.

## Testul care ar fi prins-o
`server/__tests__/par-rating-prompt.routes.test.ts` — cheamă rutele reale: listează, marchează,
listează din nou. Al doilea GET reprezintă „m-am logat din nou pe alt calculator"; pe codul vechi
(fără coloană) el întorcea aceeași cerere, deci testul pică. Verificat: pică fără filtru, trece cu el.

## Lecția generală
O verificare făcută pe dispozitivul care întreabă nu poate răspunde la o promisiune făcută
persoanei. Când te uiți la un „doar o dată", întreabă întâi: *o dată pentru cine — pentru browser,
sau pentru om?*
