---
title: Un KPI care citește câmpul greșit nu dă eroare, dă zero
problem_type: frontend / api-contract
module: Tablou de bord general (src/lib/api/businessDashboard.ts)
tags: [kpi, dashboard, api-contract, findesk]
symptoms: "„Facturi emise: 0 MDL” pe tabloul general, deși firma are facturi; „Sold net” egal cu minus cheltuielile"
severity: medium
date: 2026-09-26
---

## Simptom
Dala FinDesk de pe `/business/dashboard` arăta mereu 0 la „Facturi emise”, iar „Sold net” era
doar cheltuielile cu semn schimbat.

## Cauza, într-o propoziție
Clientul citea `invoices[].totalAmountCents` dintr-un endpoint care întoarce `data[].totalCents`,
iar `?? 0` a transformat câmpul lipsă într-un zero credibil.

## De ce n-a prins nimic
Nu există eroare: `undefined ?? 0` e un număr valid, dala se randează, testele de randare trec.
Pe lângă asta, lista de facturi e plafonată la 200 pe server, deci chiar cu câmpul corect suma ar
fi fost greșită pentru orice firmă cu mai multe facturi.

## Fix
Suma vine din agregatul de server (`/api/analytics/fin/metrics?period=ytd`: încasat + de încasat),
iar cheltuielile se cer pe aceeași fereastră de 12 luni (`dateFrom`), ca cele două cifre să fie
comparabile. Test: `src/lib/api/__tests__/businessDashboard.test.ts` (pică pe codul vechi).

## Regula
- Un KPI nu se calculează adunând o listă paginată pe client. Cere agregatul serverului.
- Tipul răspunsului se scrie o dată, lângă endpoint, și se importă. Un tip scris de mână la locul
  de apel (`api<{ invoices: … }>`) e o presupunere, nu un contract.
- Un `?? 0` pe o cifră de business ascunde exact bugul ăsta. Testul trebuie să verifice valoarea
  calculată dintr-un răspuns realist, nu doar că dala apare.
