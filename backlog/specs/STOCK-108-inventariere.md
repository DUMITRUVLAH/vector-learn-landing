---
id: STOCK-108
title: Inventarierea — listă, numărare, ajustări la postare
milestone: STOCK
phase: C
priority: P1
core_ref: [stock/STOCK-CORE.md §6.6, §4.1]
tests: inline (vezi „Tests")
depends_on: [STOCK-107]
status: pending
---

# STOCK-108 — Inventarierea

## Goal
Evidența se confruntă cu raftul. Gestionarul deschide o listă pe o gestiune, numără, introduce
cantitățile faptice, iar sistemul face singur ajustările — cu dovadă scrisă cine a numărat, când
și ce a ieșit diferență.

## In scope
- `kind='count'`: la creare, rândurile se generează din soldurile curente ale gestiunii, cu
  `qty_expected` **înghețat la deschidere** și `qty_counted` gol.
- Filtre la generare: toată gestiunea, o categorie, sau o listă de articole alese.
- `PATCH /api/fin/stock/docs/:id/lines/:lineId` completează `qty_counted` (rând cu rând, ca să se
  poată numi pe telefon, în timp ce se numără).
- Postarea creează mișcări `adjustment` **doar** pe rândurile cu diferență, cu
  `qty_signed = qty_counted − qty_expected`.
- Plusul intră la CMP-ul curent, minusul iese la CMP-ul curent (CORE §6.6).
- **Protecție la concurență**: dacă între deschiderea listei și postare au avut loc alte mișcări
  pe articolele din listă, postarea întoarce `409 stale_count` cu lista articolelor mișcate și
  cere reconfirmare explicită (`POST /:id/post?confirmStale=1`).
- Minusul nu poate depăși scripticul: soldul nu devine negativ (CORE §4.1).
- Ecran `/business/crm/stoc/inventariere`: lista documentelor + ecran de completare cu un rând
  per articol, cu diferența calculată live și evidențiată.

## Out of scope
- Numărare „oarbă" (fără afișarea scripticului). E o practică bună de control, dar cere un rol
  separat de „numărător"; se poate adăuga ca opțiune pe document mai târziu.
- Inventariere pe mai multe gestiuni simultan — o listă = o gestiune, ca și răspunderea
  gestionară.
- Export/import Excel al listei.

## Decizii, cu motivul
- **`qty_expected` se îngheață la deschidere.** Dacă s-ar reciti la postare, diferența ar fi
  calculată față de un soldat care s-a mișcat între timp — adică față de altceva decât ce a văzut
  omul când a numărat.
- **`409 stale_count` în loc de suprascriere tăcută.** O vânzare produsă în timpul numărării e
  reală; a o șterge dintr-un „am numărat 8" ar face inventarierea o unealtă care pierde date.
- **Plusul se evaluează la CMP-ul curent**, nu la un cost inventat. Marfa găsită în plus n-are
  document de intrare, deci n-are cost propriu; orice altă valoare ar fi o presupunere.
- **Se scriu mișcări doar pe diferențe.** Un rând numărat corect nu produce mișcare — altfel
  jurnalul s-ar umple cu mii de linii cu zero, iar fișa de magazie ar deveni ilizibilă.

## Acceptance criteria
- [ ] Generarea listei ia toate articolele cu sold în gestiune, cu `qty_expected` din balanță
- [ ] `qty_expected` NU se reciteste la postare
- [ ] Postarea creează mișcări `adjustment` doar pe rândurile cu `qty_counted ≠ qty_expected`
- [ ] Plus: soldul crește, CMP-ul rămâne neschimbat; valoarea crește cu `diff × avg_cost`
- [ ] Minus: soldul scade; nu poate coborî sub 0 → 422
- [ ] Mișcare pe un articol al listei între deschidere și postare → `409 stale_count` cu lista
      articolelor; cu `confirmStale=1` postarea trece
- [ ] Documentul postat păstrează `posted_by` și `posted_at` — cine a numărat și când
- [ ] `qty_counted` gol pe un rând la postare → rândul e tratat ca „nenumărat", fără mișcare (NU
      ca zero); se raportează câte rânduri au rămas nenumărate
- [ ] Documentul altui tenant → 404

## Tests
`server/__tests__/stock-count.routes.test.ts` (nou).

Blocante:
1. `[blocant]` generare listă → un rând per articol cu sold, `qty_expected` == balanța.
2. `[blocant]` numărat egal cu scripticul pe toate rândurile → postare reușită, **zero** mișcări.
3. `[blocant]` plus de 3 buc → sold +3, CMP neschimbat, valoare +`3 × avg_cost`.
4. `[blocant]` minus de 2 buc → sold −2; minus mai mare decât scripticul → 422, zero mișcări.
5. `[blocant]` **concurență**: vânzare pe un articol din listă după deschidere → postarea
   întoarce 409 `stale_count` cu acel articol; cu `confirmStale=1` trece, iar soldul final e
   exact `qty_counted`.
6. `[blocant]` rând cu `qty_counted = null` → nicio mișcare; răspunsul spune câte au rămas
   nenumărate.
7. `[blocant]` `Σ qty_signed` == soldul balanței și după inventariere (invariantul din STOCK-102).
8. `[blocant]` izolare: lista lui B → 404.

## Files
- `server/lib/finStockPosting.ts` (ramura `count`)
- `server/routes/finStockDocs.ts` (generare listă, `confirmStale`)
- `src/pages/business/crm/CrmStockCountPage.tsx` (nou) + `src/App.tsx`
- `server/__tests__/stock-count.routes.test.ts` (nou)

## DoD
Standard.
