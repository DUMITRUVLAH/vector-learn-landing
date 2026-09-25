---
title: Facturile SFS „Semnat de Cumpărător" (8) nu apar în nicio listă
category: architecture-patterns
date: 2026-09-25
tags: [par, efactura, sfs, unavailable-is-not-absent]
---

## Ce s-a întâmplat

Pe ATIC, ecranul „e-Factura prestatori" arăta 27 de cereri plătite pe „Lipsește", deși furnizorii
emiseseră facturile — mai mult, solicitanții atașaseră chiar PDF-ul e-Facturii la cerere
(`EBM000267772.pdf`, `EBK000758854.pdf` …). Copia locală avea 2.691 de facturi, dar se oprea brusc
la 19.09.2025.

## Cauza (o propoziție)

SFS ține facturile procesate în ultimul an în starea **8 „Semnat de Cumpărător"** și le arhivează
(starea 6) abia după ~un an, iar starea 8 nu apare în niciuna dintre listele pe care le citeam
(de semnat / acceptate / respinse / arhivate) — doar în `SearchInvoices` cu `InvoiceStatus=8`
explicit (omis, `xs:int` devine 0 = Draft și căutarea întoarce tăcut zero).

Agravante:
- Fereastra de potrivire (plata −30/+120 zile) rata facturile emise cu luni înainte de plată
  (audit: emisă 23.04, plătită 15.09).
- „Lipsește" se afișa fără ca vreo scanare să fi rulat (`last_scan_at` NULL pe toate rândurile) —
  o presupunere prezentată ca rezultat.

## Ce am schimbat

1. `EfacturaMdClient.searchInvoices` + sursa „facturi semnate de cumpărător" în sincronizare, căutată
   doar de la prima cerere PAR încoace (minus 60 de zile) — nu ani de arhivă.
2. e-Factura atașată la cerere (serie+număr din numele actului / analiză) se verifică direct cu
   `GetInvoicesBySeriaNumber` — funcționează pentru orice stare și dată. Dacă furnizorul din SFS
   diferă de codul fiscal din cerere, NU confirmăm, dar spunem exact ce diferă.
3. Potrivirea compară doar facturile emise de la începutul folosirii platformei; mesajul o spune.
4. Beneficiar = organizația însăși → „nu se aplică" (cardul propriu, furnizori străini).
5. Ecranul scrie „Neverificată" până la prima scanare și pornește singur scanarea.

## Regula

Când o integrare externă are *stări*, inventariază fiecare stare și ce metodă o întoarce. O stare
fără metodă de listare = o gaură tăcută. Verifică pe contul real cu un document pe care **știi**
că există (aici: actele atașate la cereri) — dacă nu apare, lista ta e incompletă, nu realitatea.

Teste: `server/__tests__/par-efactura-scan.test.ts` → „facturile din ultimul an — cazul ATIC".
