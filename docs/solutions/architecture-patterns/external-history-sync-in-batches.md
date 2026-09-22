---
title: "Istoricul dintr-un sistem extern se citește O DATĂ, în loturi, și se păstrează"
problem_type: architecture-pattern
module: PAR
tags: [par, efactura, sfs, integrare-externa, sincronizare, paginare, performanta, cursor]
symptoms: "Un ecran care citește tot istoricul dintr-un API extern la fiecare deschidere: se blochează, se taie la plafonul de timp și arată «am citit doar primele N din M»"
severity: design
date: 2026-09-22
---

## Simptomul

Ecranul „Toate e-Facturile" (PAR) arăta, sub tabel:

> 543 facturi primite găsite în SFS. SFS a răspuns parțial: am citit detaliile doar pentru primele
> 200 din 543 facturi (limită de timp)

Nu era un caz-limită: era comportamentul normal. Fiecare deschidere a tabului cerea din nou TOT
istoricul — patru liste SOAP + paginile de arhivă + XML/QR pe loturi de 20 — într-o singură cerere
HTTP. Peste ~200 de facturi nu mai încăpea în timpul funcției, iar runda următoare o lua de la capăt
cu exact aceleași prime 200. Restul de 343 nu se citeau NICIODATĂ. Pentru o organizație cu mii de
facturi în istoric, ecranul devenea inutilizabil.

## Cauza

Datele externe erau tratate ca un **flux** (le cer când am nevoie de ele), deși sunt un **istoric**
(imutabil în cea mai mare parte, crește doar la un capăt). Un istoric cerut integral, sincron, la
fiecare afișare are cost O(tot) per vizită — deci un plafon de timp îl taie mereu în același loc.

Trei consecințe care se văd în interfață:
- nu se poate sorta/filtra pe ce n-a fost citit (numai primele N aveau dată, furnizor, sumă);
- fiecare vizită consuma cota API a clientului (SFS-ul real răspunde cu HTTP 500 la rafale);
- „parțial" devenise mesaj permanent, deci nimeni nu-l mai citea.

## Tiparul corect

1. **Copie locală cu cheie stabilă.** O tabelă proprie (`par_sfs_invoices`, unic pe
   `tenant + serie + număr`) în care fiecare element extern intră o singură dată. Antetul (există)
   se separă de conținut (detalii): `details_fetched_at NULL` = „știu că există, n-am citit-o încă".
2. **Cursor persistat pentru trecut.** Istoricul se recuperează mergând înapoi, fereastră cu
   fereastră (90 de zile), cu `archive_cursor_to` salvat în baza de date. Lotul următor continuă de
   unde a rămas — inclusiv după ce omul a închis pagina.
3. **Buget de timp per lot, nu per istoric.** Un apel de sincronizare = ~8 s de muncă, apoi se
   oprește și raportează progresul. Interfața îl cheamă din nou până când `done` devine true.
4. **Incremental după recuperare.** Odată parcurs trecutul, se cere doar fereastra recentă
   (45 de zile) + listele „vii". Costul devine constant, indiferent de mărimea istoricului.
5. **Citirea pentru afișare NU atinge sistemul extern.** Ecranul interoghează copia locală: se
   deschide instant și se poate sorta/filtra/pagina pe tot, nu doar pe ce a apucat să se citească.
6. **Plafon de încercări, dar nu pe erori temporare.** Un element pentru care API-ul nu dă conținut
   iese din coadă după 3 încercări (altfel blochează restul), DAR o eroare care a picat tot lotul
   NU se numără — altfel trei căderi ale serviciului extern marchează definitiv date bune drept
   „fără conținut". O cerere explicită de reîmprospătare le repune în coadă.
7. **Zăvor per organizație.** Două taburi deschise nu au voie să tragă simultan: `running_since`
   în starea de sincronizare, plus o pauză între apelurile SOAP.

## Ce a rămas neschimbat (și de ce)

Onestitatea din [unavailable-is-not-absent.md](./unavailable-is-not-absent.md): o copie locală goală
NU înseamnă „nu există facturi". Răspunsul distinge „încă nu am citit" (`needsSync`) de „am încercat
și a eșuat" (`lastError`) de „am citit tot" (`done`), iar interfața le spune diferit.

## Testul care blochează regresia

`server/__tests__/par-efactura-cache.test.ts` rulează sincronizarea ADEVĂRATĂ cu un client SFS care
numără apelurile și verifică:
- fiecare factură e cerută din API **o singură dată**, oricâte loturi ar fi;
- un lot întrerupt de buget se reia de unde a rămas (nu de la zero);
- după recuperarea istoricului, sincronizarea următoare nu mai plimbă toată arhiva;
- facturile deja salvate supraviețuiesc unei căderi ulterioare a API-ului.

## Semnul că ai aceeași problemă în altă parte

Caută mesaje de forma „primele N din M" sau plafoane de tip `const FETCH_MAX = …` puse ca să încapă
în timpul unei cereri. Un plafon care taie date într-o citire sincronă e aproape întotdeauna un
istoric care trebuia sincronizat incremental.
