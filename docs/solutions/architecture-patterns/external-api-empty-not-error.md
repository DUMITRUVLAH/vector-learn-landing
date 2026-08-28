---
title: BNM întoarce XML GOL pentru datele vechi, nu o eroare — istoricul cursului părea „indisponibil"
problem_type: architecture_pattern
module: par-fx, server/lib/fx.ts, server/lib/bnm/rates.ts
tags: [external-api, bnm, exchange-rates, archive, csv, empty-response, silent-failure]
symptoms: selectorul de dată arată „curs indisponibil" pentru orice zi mai veche de ~45 de zile; graficul pe ani rămâne gol, fără nicio eroare în log
severity: P2
date: 2026-08-28
---

## Simptom

Secțiunea „Curs valutar" din PAR funcționa perfect pe ziua curentă și pe ultimele săptămâni.
Aleg în selector o dată din 2023 → „BNM nu a publicat un curs" (sau, după ce codul mergea 7 zile
înapoi, „curs indisponibil"). Niciun 404, niciun timeout, nicio excepție — deci nimic de depanat
în log.

## Cauza

BNM are **două** surse, iar diferența dintre ele nu e documentată nicăieri:

| endpoint | ce servește |
|---|---|
| `official_exchange_rates?get_xml=1&date=DD.MM.YYYY` | doar zilele **recente** (~45 de zile). Pentru o dată mai veche întoarce `200 OK` cu `<ValCurs Date="..."></ValCurs>` — **gol**, nu eroare. |
| `export-official-exchange-rates?date=DD.MM.YYYY` | **arhiva completă**, în CSV, până în anii 2010. Pentru zilele vechi doar valutele principale (EUR, USD, UAH, RON, RUB); `404` pentru date viitoare. |

Codul cerea XML pentru orice dată. Un răspuns gol e nedistinsibil, la nivel de cod, de „ziua asta
n-are curs publicat" — exact starea legitimă dintr-o sărbătoare. Așa că logica de fallback
(mergi înapoi până găsești o zi publicată) mergea cuminte 7 zile în urmă prin XML-uri goale și
raporta corect, dar despre o realitate falsă.

## Fix

`getQuotesForDate` alege sursa după **vechimea** zilei: XML sub 45 de zile (listă completă de
valute), CSV peste — cu cădere pe CSV și pentru zilele recente, ca ziua de la limita orizontului
să nu se piardă. Parserul de CSV e în `server/lib/fx.ts` (`parseBnmCsv`): `;` ca separator,
zecimala virgulă, nume între ghilimele, `Rata` = nominalul, `Cursul` = valoarea pentru nominal.

## Lecția (clasa de bug, nu cazul)

> **Un serviciu extern care întoarce „gol" în loc de „eroare" pentru o intrare în afara domeniului
> nu îți spune că ai greșit — îți confirmă o minciună.** Codul tău o traduce în cea mai apropiată
> stare legitimă („nu există date pentru ziua asta") și eșecul devine invizibil.

Când integrezi o sursă externă, testeaz-o **la marginile domeniului**, nu doar pe cazul fericit:
o dată foarte veche, una viitoare, un cod inexistent. Dacă răspunsul gol e plauzibil ca stare
normală, ai nevoie de o a doua sursă sau de un semnal care le separă — altfel nu vei ști niciodată
că jumătate din funcționalitate nu merge.

## Testul care blochează regresia

`server/__tests__/parFx.routes.test.ts` → `describe("arhiva BNM (CSV)")`. Fetch-ul fals imită
comportamentul real: pentru o zi marcată `archiveOnly`, XML-ul întoarce `<ValCurs>` gol iar CSV-ul
are datele. Testul pică pe codul vechi (doar-XML) și trece pe cel nou; verifică și că pentru
zilele vechi nici nu se mai cere XML.

## De reținut și pentru altceva

BNM **nu are** endpoint pe interval (verificat: `date_to`, `date_from`, variantele `/csv`, `/xml`
și `official_exchange_rates_dynamic` — toate 404 sau ignoră al doilea parametru). O singură zi per
cerere. De aceea graficele pe ani se eșantionează și se memorează în `bnm_rates`.
