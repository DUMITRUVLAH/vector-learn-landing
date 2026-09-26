---
category: frontend
date: 2026-09-26
symptom: "Pe telefon, Pipeline CRM se deschide micșorat la 40% (986px pe 390), deși tot ce e lat stă într-un container cu overflow-x-auto"
files:
  - src/pages/business/crm/CrmPipelinePage.tsx
  - src/components/ds/Table.tsx
  - src/components/ds/PageHeader.tsx
  - scripts/e2e-crm-mobile.mjs
---

# Un `position: absolute` scapă din containerul care derulează dacă acesta nu e `relative`

## Ce s-a găsit (cererea ownerului, 26.09.2026: „e2e pe mobil, compact, scroll unde e ok")

Coloanele tablei Pipeline pe telefon au devenit un rând care se glisează lateral
(`flex overflow-x-auto snap-x`). Pagina tot ieșea 986px lată. Niciun element „în flux" nu trecea
de 390px — dar etichetele `sr-only` din cartonașe (`position: absolute`) aveau ca bloc de conținere
un strămoș din AFARA containerului care derulează. Un element absolut e tăiat de `overflow` doar
dacă acel container e (sau conține) blocul lui de conținere. Deci etichetele invizibile din coloana
a 5-a stăteau la x≈900 în document și lățeau pagina; browserul mobil o deschidea micșorată.

## Regula

Orice container `overflow-x-auto` / `overflow-auto` care poate avea descendenți absoluți
(`sr-only`, badge-uri, pseudo-elemente de zonă de apăsare) primește și `relative`. `Table` din design
system îl are acum; tabla Pipeline pe mobil la fel.

## A doua capcană din aceeași zi: acțiunile din antet

`PageHeader` punea acțiunile pe un rând `shrink-0` care nu se rupea: 6 butoane = 809px pe un
iPhone, cu „Adaugă lead" în afara ecranului. Pe telefon rândul derulează acum lateral, iar butonul
principal (`data-variant="default"`) trece primul, ca adăugarea să fie mereu la vedere.

## Cum se prinde

`scripts/e2e-crm-mobile.mjs` compară lățimea documentului cu lățimea DISPOZITIVULUI (nu cu
`clientWidth`, care pe o pagină lățită e chiar valoarea greșită) și numește cel mai lat element
din afara unui scroller (excluzând barele fixe, care doar urmează fereastra lățită). Tot acolo:
derularea se face `behavior: "instant"` — aplicația are `scroll-behavior: smooth`, iar o derulare
lină neterminată făcea verificarea „ultimul rând nu e sub bara de jos" să raporteze fals.
