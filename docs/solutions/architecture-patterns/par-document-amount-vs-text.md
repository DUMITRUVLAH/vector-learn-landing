---
title: Suma extrasă de AI se verifică față de textul documentului
date: 2026-09-24
category: architecture-patterns
severity: high
tags: [PAR, AI, extraction, reconcile, money]
---

## Ce s-a întâmplat

Cele 94 de acte reale ATIC au fost rejucate prin prefill și prin `/reconcile`:

- **Banii tăiați.** Promptul cerea suma „în UNITĂȚI ÎNTREGI", iar toate exemplele aveau „,00".
  Modelul tăia zecimalele: 602,84 + 9 042,57 (AGEPI) au intrat în cerere ca 602 + 9042, iar cererea
  s-a plătit cu 1,41 lei mai puțin decât factura.
- **Un identificator citit ca sumă.** Numărul facturii EBK000758854 → 758 854,00 lei; codul fiscal
  ATIC → 1 006 600 034 927,00 lei (și pe calea de rezervă regex). Avertismentul absurd arăta a
  zgomot, iar pe aceeași cerere (PAR-2026-0003) s-a plătit dublul facturii.
- **Alarme false** care îngropau alarmele reale: factura împărțită pe mai multe cereri, plata cu
  cardul organizației, un IDNP greșit tipărit în rubrica de semnături a actului.

## Reparația

- `server/lib/par/amountSanity.ts` (pur): recuperează banii din text când documentul îi scrie
  într-un singur fel; anulează o sumă care e de fapt un identificator; cifra de control IDNO/IDNP.
  Aplicat în `extractParParties` pe TOATE ramurile (model + rezervă), ca prefill-ul și verificarea
  să primească aceeași sumă.
- `/reconcile`: suma în litere ca la prefill; factura împărțită (același nume + mărime pe mai multe
  cereri vii) se compară cu suma cererilor; plata din fondurile proprii (IDNO-ul plătitorului) nu
  mai acuză beneficiarul; un cod de pe document care pică cifra de control nu acuză o cerere cu
  codul corect — dar un cod greșit în CERERE rămâne acuzat (Deea House).
- Promptul: „unitatea principală, PĂSTRÂND ZECIMALELE", cu exemplu „1 508,51 → 1508.51".

Rezultat pe datele reale: avertismente de la 27 la 18; cele rămase sunt fie diferențe reale
(0003, 0004, 0006, Deea House, 0063), fie situații pe care documentul nu le poate lămuri (tranșă
parțială, act de verificare, dovada de plată greșită).

## Regula

Verifică orice cifră a modelului față de textul din care a citit-o, într-un singur loc comun
tuturor căilor. Un avertisment fals nu e inofensiv: îi învață pe oameni să ignore avertismentele.
