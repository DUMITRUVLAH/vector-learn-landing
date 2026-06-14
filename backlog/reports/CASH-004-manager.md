# CASH-004 — Persona Manager Report (Andreea Mitran)

**Item:** CASH-004 — UI încasări: registru plăți, donut alocări, link-uri de plată
**Date:** 2026-06-14
**Verdict:** BUY

## Evaluation

Andreea (director 6 filiale, 1400 studenți):

"Donut-ul răspunde la întrebarea pe care o primesc de 10 ori pe zi: câți bani avem disponibili?
Acum văd dintr-o privire: alocat vs. nealocat. Nu mai trebuie să sun contabila."

"Filtrele pe perioadă și cont bancar sunt exact ce îmi trebuie — raportez separat pe 4 conturi
(MAIB MDL, MAIB EUR, Mobiasbanca MDL, Victoriabank MDL). Select simplu, ușor de folosit."

"Butonul 'Creează plată' din tab Nepotrivite e super rapid. Înainte dura 5-10 minute să leg
o tranzacție de un client. Acum e 2 click-uri."

"Modal-ul de alocare: că nu pot aloca mai mult decât am disponibil e exact ce voiam.
Eroarea e clară, nu trebuie să știi contabilitate ca să înțelegi."

## Concerns

- party_id apare ca UUID în tabel (nu ca name al clientului) — dacă fin_parties nu e merge-uit,
  trebuie un fallback label "Necunoscut". Am văzut că pagina îl afișează italic cu 'Necunoscut'.
  OK pentru MVP.
- Nu există paginare vizibilă (50 rânduri/pagină — limitată server-side). Dacă am 200 plăți?
  Ar trebui un buton "Pagina următoare". Backlog pentru CASH-005.

## Score: 8.5/10
