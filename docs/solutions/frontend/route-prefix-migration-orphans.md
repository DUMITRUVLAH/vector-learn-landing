---
title: Un modul mutat pe alt prefix de rută lasă în urmă pagini orfane și id-uri goale
problem_type: frontend / routing
module: FinDesk (/app/fin → /business/fin), IT Park, Parteneri, Registru
tags: [routing, hash-router, migration, orphan-pages, findesk, itpark]
symptoms: "Rezidenți IT Park rămâne pe spinner pentru totdeauna, fără meniu; fișa partenerului nu găsește partenerul; butoane care te aruncă pe tabloul general"
severity: high
date: 2026-09-26
---

## Simptom
După mutarea FinDesk de pe `/app/fin/*` pe `/business/fin/*`:
- `/business/fin/itpark` randa fișa unui dosar, care căuta id-ul cu `/^\/app\/fin\/itpark\/…/` → id gol,
  spinner infinit, fără meniu. 9 din 10 pagini IT Park nu erau rutate deloc.
- `PartyDetailPage` căuta `/\/app\/fin\/parties\/…/` → fișa partenerului nu găsea id-ul.
- 23 de linkuri `#/app/fin/*` în 13 pagini cădeau în `RedirectToBusiness` (tabloul general).
- Trei pagini întregi (registrul contabil, cartea mare, termenele fiscale) existau pe disc fără rută,
  iar rândul „Registru general” deschidea altceva (tabloul de analiză).

## Cauza, într-o propoziție
Mutarea a schimbat dispecerul, dar nu și locurile care *cunoșteau* prefixul: regexuri de id cu
prefix fix, linkuri literale și rute care n-au fost reînregistrate.

## De ce n-a prins nimic
Testele unitare mock-uiau `path` cu prefixul vechi, deci treceau. Nimic nu verifica că o pagină de pe
disc are rută sau că un rând din meniu deschide o pagină cu conținut (nu un spinner).

## Fix
- Id-urile se citesc fără prefix (`itparkIdFromPath`, `extractPartyId`: `/\/parties\/([^/?#]+)/`).
- Căile unui modul trăiesc într-un singur fișier (`src/lib/itpark/paths.ts`).
- Dispecerul redirecționează `/app/fin/*` → `/business/fin/*` (linkurile din emailuri merg în continuare).
- Paginile orfane sunt rutate; „Registru general” deschide registrul, „Analiză financiară” analiza.

## Gărzile care fac clasa imposibilă de reintrodus în tăcere
- `src/__tests__/fin/nav-09-no-legacy-links.test.ts`: niciun link / regex `/app/fin` în cod, și nicio
  pagină din `src/pages/fin` neimportată. A picat pe `PartyDetailPage` la prima rulare.
- `scripts/e2e-findesk-nav.mjs`: fiecare rând din harta FinDesk deschide o pagină cu un singur `<h1>`,
  identic cu meniul; IT Park și Parteneri sunt deschise cu un dosar/partener creat prin API.

## Regula
Când muți un modul pe alt prefix: (1) caută prefixul vechi în tot `src/`, nu doar în dispecer;
(2) listează paginile modulului de pe disc și verifică că fiecare are rută; (3) deschide în browser
fiecare rând din meniu cu date reale — „se încarcă” nu e verde.
