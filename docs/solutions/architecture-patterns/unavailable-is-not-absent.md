---
title: "„Nu am putut verifica” nu are voie să se scrie „nu există”"
problem_type: architecture-pattern
module: PAR
tags: [par, efactura, sfs, integrare-externa, stare, onestitate, remindere]
symptoms: "O verificare împotriva unui sistem extern neconfigurat (sau în mod simulat) marchează datele ca lipsă și declanșează acțiuni către oameni — remindere, alerte, blocaje"
severity: design
date: 2026-08-28
---

## Tiparul

Orice funcție care răspunde la „X există în sistemul extern?" are **trei** rezultate, nu două:

1. `găsit` — am întrebat și am primit dovada;
2. `negăsit` — am întrebat și sistemul a spus clar că nu are nimic;
3. `indisponibil` — **nu am putut întreba** (fără credențiale, mediu simulat, API căzut, drepturi
   lipsă pe metodă).

Al treilea NU se colapsează în al doilea. Dacă se colapsează, produsul minte cu încredere — și, mai
rău, acționează pe minciună.

## Cazul concret (PAR-EFP, 2026-08-28)

Modulul „e-Factura de la prestator" verifică în SIA e-Factura (SFS) dacă prestatorul a emis factura
pentru o plată PAR și, când nu, oferă un buton care trimite reminder solicitantului cererii.

Varianta naivă — „scanez; ce nu găsesc, e lipsă" — ar fi trimis remindere pentru TOATE plățile în
orice workspace fără credențiale SFS (adică toate, până la configurare), acuzând prestatori care își
făcuseră treaba. Costul nu e un rând greșit într-un tabel, ci un email către un om.

## Soluția aplicată

- `scanEfacturasForTenant` întoarce `available: false` și **nu scrie nimic** în stare când SFS e
  neconfigurat sau pe mock — nu setează nici măcar `last_scan_at` (o verificare care nu a avut loc
  nu se înregistrează ca verificare).
- Starea `expected` înseamnă „o așteptăm"; abia `expected` + `last_scan_at` completat înseamnă
  „am căutat și nu am găsit". Interfața spune diferit cele două lucruri.
- Reminderul rămâne posibil manual (omul decide), dar nimic nu îl declanșează automat pe baza unei
  verificări care nu s-a făcut.

Regresiile care apără regula: `server/__tests__/par-efactura-scan.test.ts` („fără credențiale SFS nu
atinge starea"), `server/__tests__/par-efactura.routes.test.ts` și pasul 3 din
`scripts/e2e-par-efactura.mjs`.

## Recidiva din aceeași zi (de ce regula are nevoie de teste, nu de bune intenții)

Câteva ore mai târziu, ecranul „Toate e-Facturile" arăta „Nicio factură primită în SFS" pe un cont cu
45 de facturi. Două cauze, ambele exact tiparul de mai sus:

1. **Interogam listele greșite.** Facturile procesate trec în starea „Arhivat" și dispar din
   `GetInvoicesForSigning` / `GetAcceptedInvoices`. Lista goală era adevărată pentru acele două
   metode și complet falsă pentru întrebarea pusă de om. Fix: `GetArchivedInvoices` (interval +
   paginare), plus textul codului QR ca sursă de furnizor/sumă, fiindcă XML-ul vine gol la arhivate.
2. **Interfața ascundea eroarea.** Când toate apelurile SFS picau, serviciul returna o listă goală cu
   mesajul de eroare atașat — dar ecranul afișa mesajul DOAR când lista avea rânduri. „Gol" și
   „n-am putut citi" arătau identic. Fix: `ok=false` la eșec total → `available:false`, iar mesajul
   se afișează și pe starea goală.

Regresiile: „facturile arhivate — cazul contului real" și „când SFS refuză toate listele" din
`server/__tests__/par-efactura-scan.test.ts`.

## Cum se aplică în altă parte

- Sincronizări bancare, verificări de registru (contafirm), statusuri de plată, orice `GET` extern:
  starea din DB trebuie să poată distinge „am întrebat" de „nu am putut întreba".
- Când o acțiune vizibilă pentru un om (email, alertă, blocaj) depinde de rezultat, cere explicit
  rezultatul `negăsit` — niciodată absența unui răspuns.
