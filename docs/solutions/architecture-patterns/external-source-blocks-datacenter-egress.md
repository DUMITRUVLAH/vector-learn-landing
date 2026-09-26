---
title: bnm.md a început să lase fără răspuns cererile din centre de date — „Curs valutar" a rămas la skeleton
problem_type: architecture_pattern
module: par-fx, bnm-rates
tags: [external-api, egress, geo-block, timeout, circuit-breaker, cache-fallback, vercel, github-actions]
symptoms: pagina Curs valutar rămâne pe skeleton/spinner; GET /api/par/fx/rates → 503 bnm_unavailable după ~16s; oglinda `bnm_rates` are date, dar nu sunt folosite
severity: P1
date: 2026-09-26
---

## Simptom
Pagina „Curs valutar" (`/business/par/fx`) nu se mai încărca: cartelele rămâneau skeleton, graficul
învârtea la infinit. `GET /api/par/fx/rates` întorcea `503 bnm_unavailable` — dar abia după ~16 s,
iar `GET /api/par/fx/series` la fel. Oglinda locală (`bnm_rates`) avea 12.936 de rânduri, cu cursul
oficial până pe 24.09 inclusiv.

## Cauza reală — două lucruri suprapuse

**1. Sursa a început să ne refuze.** Aceleași URL-uri, în aceeași secundă:

| de unde | rezultat |
|---|---|
| laptop (rețea obișnuită) | `200` în ~200 ms |
| runtime Vercel (iad1) | conexiunea expiră, niciun răspuns |
| runner GitHub Actions (Azure) | conexiunea expiră, niciun răspuns |
| alt sandbox de cloud (US) | conexiunea expiră, niciun răspuns |

Nu e o pană a BNM și nu e ceva reparabil în cod: e un filtru pe partea lor, pe intervale de IP de
centru de date. A apărut între 24.09 (ultima zi memorată cu succes DIN Vercel, `fetched_at`
24.09 06:46 UTC) și 26.09. Semnătura e „timeout", nu „403" — pachetele sunt aruncate în tăcere.

**2. Codul nostru transforma asta în pagină moartă, deși avea datele.** `getQuotesForDate` prindea
excepția de la XML, dar **nu** și pe cea de la CSV:

```ts
if (quotes.length === 0) {
  quotes = await fetchBnmQuotesCsv(date, …);   // ← aruncă la timeout
}
```

Excepția ieșea din funcție, `getEffectiveQuotes` n-o prindea, iar ruta răspundea 503 din primul
`catch` — **înainte** ca mersul înapoi zi-cu-zi să ajungă la 24.09, care era în oglindă. Plus 8 s
(XML) + 8 s (CSV) plătite degeaba pe calea unei cereri HTTP.

## Reparația
`server/lib/bnm/rates.ts`:
- nicio descărcare nu mai aruncă în sus — „n-am ajuns la sursă" e o **stare**, nu o excepție care
  oprește căutarea;
- **breaker de un minut** după primul eșec: altfel fiecare zi lipsă mai costă un timeout, iar un
  grafic pe 30 de zile e tăiat de platformă;
- **ultima plasă**: cea mai recentă zi memorată ≤ data cerută, printr-un singur SELECT pe index;
- `stale_reason` deosebește „BNM n-a publicat (weekend)" de „n-am putut contacta bnm.md", iar
  bannerul spune care din ele e — altfel omul semnează o cerere crezând că are cursul de azi;
- timeout 8 s → 5 s pe calea cererii.

`scripts/bnm-mirror-sync.ts` (`npm run fx:sync -- --env-file=…`) aduce zilele lipsă **de pe o mașină
care are acces** și le scrie în `bnm_rates`. Nu poate rula în CI: runner-ul e blocat la fel.

## Lecția care se generalizează
Când o sursă externă e pe calea unei pagini, întreabă-te nu „dacă pică", ci **„ce vede omul când
pică"**. Aici aveam deja răspunsul corect în bază; l-a ascuns o singură excepție neprinsă.

1. O funcție care alimentează un fallback **nu are voie să arunce** — altfel omoară exact drumul
   care trebuia să salveze pagina.
2. Un cache local nu e doar optimizare: e **sursa de rezervă**. Trebuie să existe un drum care
   ajunge la el fără să treacă prin rețea.
3. După primul eșec, **nu mai plăti timeout-ul** pentru fiecare element al buclei.
4. „Date vechi", spuse pe față și cu motivul corect, bat o pagină goală — dar numai dacă motivul e
   cel adevărat. Două cauze care arată identic în cifre au nevoie de două texte diferite.
5. Înainte de a bănui codul, **măsoară de unde se vede problema**: laptop vs. runtime vs. CI. Aici
   tabelul de mai sus a mutat diagnosticul din „bug la noi" în „filtru la ei" în câteva minute.

## Regresia care o prinde
`server/__tests__/parFx.routes.test.ts` → `describe("când bnm.md nu răspunde …")`: cu `fetch` care
aruncă la fiecare apel și o zi în oglindă, ruta trebuie să întoarcă **200 + `stale_reason:
"source_unreachable"`**. Pe codul vechi testele pică cu 503 — verificat.
