---
title: Documentele se micșorează ÎNAINTE de Storage, dar niciodată cele semnate
category: architecture-patterns
date: 2026-09-23
tags: [storage, supabase, pdf, compresie, semnatura-electronica]
---

# Documentele se micșorează înainte de Storage — cu o excepție care nu se negociază

## Problema măsurată (23.09.2026)

Supabase Storage al proiectului ținea **95,09 MB** din cei 5 GB ai planului, din care **86 MB erau
PDF-uri**. Compoziția reală, nu presupusă (`npm run storage:report`):

| Categorie | Volum | De ce era mare |
|---|---|---|
| Chitanțe Meta Ads (TCPDF) | 35 MB (35 fișiere × ~1 MB) | fonturi încorporate în stream-uri **fără niciun filtru** |
| e-Facturi SFS `.signed.pdf` | 18 MB | semnate — intangibile |
| Contracte scanate | ~10 MB | JPEG la 200 DPI, fără strat de text |
| „Patenta AB 282679…pdf" | 1,27 MB ×3 | **1,3 MB de umplutură după `%%EOF`** (fixture de e2e urcat în prod) |

## Ce s-a făcut

1. **La încărcare** (`src/lib/upload/compressForUpload.ts`) — micșorare în browser, înainte de
   semnarea URL-ului, ca mărimea declarată, calea din Storage și verificarea de la `finalize` să
   descrie același fișier. Două treceri:
   - **fără pierderi**: stream-urile rămase necomprimate se comprimă cu Flate (−69% pe chitanțele
     TCPDF), iar rescrierea aruncă ce nu ține de document (octeții de după `%%EOF`);
   - **scan**: paginile care sunt deja doar o fotografie (fără fonturi în resurse, o singură
     imagine JPEG) se reîncodează la 150 DPI / q 0,62 — `Contract Fox.pdf`: 3,11 MB → 1,44 MB.
2. **Pentru trecut** — `scripts/storage-compress.ts`, rulat pe storage-ul real:
   **95,09 MB → 56,68 MB** (54 obiecte, −40%), cu originalele salvate local, mărimile din baza de
   date aliniate și fiecare obiect recitit după scriere. Copia patentei din dosar: 1241 KB → 497 KB.

## Regula care nu se încalcă: nimic semnat nu se rescrie

O semnătură PDF acoperă un interval de octeți din chiar fișierul acela (`/ByteRange`). Orice
rescriere — chiar una care nu schimbă un pixel — mută offset-urile și **desemnează** documentul.

Dovada că pericolul e real, nu teoretic: pe `74484483_1_FiscalInvoice.pdf` (e-Factură semnată,
1,71 MB), o simplă reîncărcare-și-resalvare cu pdf-lib dă 324 KB. Pare o compresie de 82%; cei
1,4 MB „economisiți" sunt semnătura și actualizarea incrementală care o poartă.

`src/lib/upload/signedDocs.ts` decide înainte de orice compresie, după marcaje (`/ByteRange`,
`/Type /Sig`, SubFilter PAdES, `/Encrypt`) **și** după nume (`.signed.pdf`, `.p7s`, `.asice`,
`.xml`). La orice îndoială răspunde „semnat".

## Lecțiile de reținut

- **pdf-lib poate „comprima" spectaculos pierzând conținut.** De asta fiecare rescriere trece prin
  `verifyStructurallyEqual`: același număr de pagini, aceleași dimensiuni, același număr de
  operatori de text, de imagini **și de adnotări**. Fiecare dintre ele prinde altceva; testul care
  le demonstrează că pot pica e în `src/lib/upload/__tests__/pdfShrink.test.ts`.
- **Verifică cu ALT parser decât cel care a scris.** Backfill-ul recitește obiectul urcat cu
  pdf.js (prin `unpdf`) și compară textul extras cu originalul; la nepotrivire **pune originalul
  înapoi automat**. O verificare făcută cu unealta care a produs fișierul nu verifică nimic.
- **Un PDF cu strat de text nu se rasterizează niciodată.** Din el se extrag suma, IBAN-ul și
  codul fiscal (`readUploadedDoc`); spațiul câștigat s-ar plăti cu pre-completarea AI.
- **1754 px (150 DPI) e pragul de jos, nu o preferință.** Modelele de vedere micșorează oricum
  imaginea sub ~1568 px pe latura lungă, deci la 1754 px nu se pierde nimic din ce vede AI-ul.
- **Un scan poate avea un LANȚ de filtre.** Scanerele de birou scriu imaginea ca
  `[/FlateDecode /DCTDecode]` — JPEG comprimat încă o dată cu Flate. Codul care căuta un singur
  filtru trimitea octeții comprimați la decodor, acesta nu recunoștea un JPEG, și tot fișierul
  rămânea neatins. Exact asta pățea copia patentei (Xerox VersaLink B7035). Regresia e în teste,
  cu umplutură pseudo-aleatoare în JPEG-ul de fixture: cu spații, Flate ar fi strivit-o și testul
  ar fi măsurat altceva decât face un scan adevărat.
- **Suitele e2e scriu în Storage-ul de producție.** Cele trei „Patenta AB 282679…pdf" de 1,27 MB
  erau fixture-uri de test, cu 1,3 MB de umplutură fiecare, urcate în bucket-ul clientului.

## Ce NU rezolvă asta

**45% din storage (41 MB din 92) erau copii identice** ale acelorași fișiere reurcate (același nume, aceeași
mărime: `MM8710246.signed.pdf` de 4 ori, `74484483_1_FiscalInvoice.pdf` de 3 ori). Deduplicarea
după amprenta conținutului ar câștiga mai mult decât compresia și ar merge și pe actele semnate,
dar are o capcană: ștergerea unui atașament ar șterge obiectul partajat de sub celelalte. Cere
numărătoare de referințe, deci o fază separată.
