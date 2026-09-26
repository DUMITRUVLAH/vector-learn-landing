# FinDesk — reorganizarea modulelor (NAV-REORG)

Cerută de owner pe 2026-09-26: gruparea modulelor FinDesk după locul lor, comasarea facturii cu
e-Factura, mutarea în CRM a ce ține de vânzări și un prim ecran mai bun.

## Ce era greșit

- Meniul FinDesk avea **26 de rânduri plate**, sub rândurile PAR, fără nicio grupare. Omul derula ca
  să ajungă la „Calendar fiscal”.
- „Facturi”, „Cont de plată” și „e-Factura” erau trei rânduri separate pentru același lucru: factura.
  Paginile Facturi și e-Factura aveau și **două titluri** (antetul shell-ului plus propriul `<h1>`).
- „Import extras bancar” și „Istoric extrase” erau două rânduri pentru aceeași listă.
- Contractele (Acorduri) sunt un act de vânzare, dar stăteau doar în FinDesk.
- **Primul ecran FinDesk** arăta 13 din 15 carduri pe gri, marcate „În curând”, deși toate modulele
  există și funcționează. Primul lucru pe care îl vedea omul era că produsul pare neterminat.

## Decizii (luate autonom, reversibile)

1. **FinDesk primește meniu propriu**, ca PAR și CRM: în interiorul `/business/fin/*` meniul arată doar
   FinDesk, grupat, cu „Înapoi la module” sus.
2. **Grupele FinDesk** (o singură sursă, `src/lib/fin/finNav.ts`, folosită de meniu și de ecranul de
   start):
   - *(fără titlu)*: Acasă, Compania mea, Parteneri
   - **Facturare**: Facturi (cu file: Facturi · Cont de plată · e-Factura SFS), Încasări, Contracte*
   - **Cheltuieli**: Cheltuieli, Invoice Reporting, Mijloace fixe, Stocuri
   - **Bancă**: Extrase bancare (import + istoric într-un rând), Conturi bancare
   - **Fiscal & conformitate**: TVA & declarații, Reconciliere & TVA import, Salarizare,
     Calendar fiscal, Rezidenți IT Park
   - **Contabilitate & rapoarte**: Registru general, Buget, Export & rapoarte, Operațiuni în masă
   - **Setări**: Securitate, Audit AI
3. **Facturare = un singur modul.** Facturile, contul de plată și e-Factura sunt file ale aceleiași
   pagini, cu un singur titlu. Rutele vechi rămân valide (linkuri, marcaje).
4. **CRM primește „Contracte” și „Facturi”** (grupa „Contracte & facturare”), la
   `/business/crm/contracte` și `/business/crm/facturi`, cu aceleași date și aceleași pagini.
   *Contractele stau în FinDesk doar când CRM-ul e oprit* — altfel locul lor e în vânzări.
   **Facturile rămân și în FinDesk**: vânzările le emit, contabilitatea le raportează la SFS și le
   închide pe TVA. Ascunderea lor din FinDesk ar lăsa contabilul fără e-Factura.
   Rândurile din CRM apar doar când e pornit și FinDesk (seria de facturare și profilul fiscal
   se configurează în FinDesk → Compania mea).
5. **Primul ecran FinDesk** devine un tablou de lucru: ce e de făcut azi (obligații fiscale restante
   și următoarele termene, facturi restante), patru cifre (de încasat, venit luna, profit luna,
   următorul termen) și toate modulele pe grupe, fără niciun „În curând”.

## Item-uri

| ID | Titlu | Stare |
|----|-------|-------|
| NAV-01 | Meniu FinDesk dedicat, grupat (sursă unică `finNav.ts`) | livrat |
| NAV-02 | Facturare unificată: Facturi · Cont de plată · e-Factura ca file, un singur titlu | livrat |
| NAV-03 | Extrase bancare: import + istoric într-un rând | livrat |
| NAV-04 | CRM: Contracte + Facturi în meniul CRM | livrat |
| NAV-05 | Primul ecran FinDesk: tablou de lucru + module pe grupe | livrat |
| NAV-06 | Tabloul de bord general: fără dale-placeholder („Disponibil în FinDesk →”) | livrat |
| NAV-07 | Un titlu per pagină, cu numele din meniu (11 pagini aveau două `<h1>`) | livrat |
| NAV-08 | IT Park: modulul întreg rutat în `/business/fin/itpark/*` (azi doar detaliul, rupt) | livrat |
| NAV-09 | Fără `/app/fin`: 23 de linkuri + redirecționare, 3 pagini orfane rutate, fișa partenerului reparată | livrat |
| NAV-10 | Bancă: un singur import și o singură coadă de potrivire (propunere, mai jos) | **decizie owner** |
| NAV-11 | IT Park: editarea unui dosar (formularul de creare în mod „edit”) | livrat |
| NAV-12 | Contract din CRM pe clientul CRM: „Contract nou” în fișa clientului, partener FinDesk găsit/creat o dată | livrat |

## Backlog descoperit (nu intră în faza asta)

- ~~IT Park: editarea unui dosar nu există~~ → NAV-11.

- ~~Contractul din CRM se leagă de un partener FinDesk, nu de firma din CRM~~ → NAV-12 (punte
  idempotentă `POST /api/fin/parties/from-crm-company`, după IDNO apoi nume).
- Actele CRM (ofertă, contract, act de primire-predare, `/business/crm/documente`) și contractele
  recurente FinDesk (`fin_agreements`) sunt două sisteme de „contract”. Trebuie o decizie: contractul
  semnat din CRM devine automat contract recurent cu facturare?
- „Salarizare” și „Pontaj” sunt module separate care ar trebui să comunice (orele din pontaj → statul
  de plată).

## Faza 2 — ce a mai găsit măturarea (2026-09-26)

- 11 pagini FinDesk aveau **două titluri** (antetul shellului + propriul `<h1>`) sau un nume diferit
  de meniu („Active Fixe” / „Mijloace fixe”, „Operații Bulk” / „Operațiuni în masă”). Acum titlul e
  unul, cel din meniu, iar `scripts/e2e-findesk-nav.mjs` verifică asta pentru fiecare rând al hărții.
- „Registru general” deschidea un tablou de analiză (venituri, profit, cashflow), nu registrul
  contabil → redenumit „Analiză financiară”.
- „Import extras” din Încasări și „Raport stoc” din Stocuri trimiteau la `#/app/fin/…` (aplicația
  „learn”). Stocuri vorbea de „materiale didactice” — text rămas din CRM-ul școlar.
- **IT Park e rupt pe `/business`**: din 10 pagini e rutată doar fișa unui dosar, care caută id-ul
  după prefixul vechi `/app/fin/itpark/<id>` → pe `/business/fin/itpark` rămâne pe spinner, fără
  meniu. Lista, asistentul, anexele și scrisorile nu sunt accesibile deloc → NAV-08.

## NAV-10 — propunere: zona „Bancă” are patru uși de import pentru același extras

Ce există azi (verificat în cod și în browser, 2026-09-26):

| Ecran | Rută | Ce importă | Unde scrie | Ce face apoi |
|---|---|---|---|---|
| Extrase bancare | `/statement/upload` | PDF, CSV, Excel, MT940, OFX | `fin_captures` (liniile extrasului) | potrivire cu facturile (Invoice Reporting), export e-Factura |
| Conturi bancare | `/banklink/import` | OFX, MT940 | `fin_bank_transactions` (coloanele BankLink) + `fin_bank_connections` | auto-potrivire cu facturi, coadă |
| Încasări | `/cash/import` (din butonul „Import extras”) | CSV, MT940 | `fin_bank_transactions` (coloanele Cash) | plăți + alocări pe facturi, coadă „Nepotrivite” |
| Reconciliere & TVA import | butonul de pe pagină → `/api/fin/cash/import` | CSV, MT940 | același import ca Încasări | potrivire cu documentele echipelor |

Plus `/cash` („Tranzacții bancare importate”), o a cincea vedere peste aceleași tranzacții.

Problema pentru utilizator: contabilul are un singur extras de la bancă și patru locuri în care să-l
încarce, fiecare cu alt format acceptat și altă coadă de potrivire. Ce a încărcat într-un loc nu apare
în celelalte. Problema tehnică: `fin_bank_transactions` e definită de DOUĂ scheme (`finCash.ts` și
`finBankLink.ts`) cu coloane diferite. Pe prod tabela le are pe amândouă (creată istoric din schemă),
dar o bază nouă, creată din migrări, nu are coloanele BankLink și nici `fin_bank_connections` →
„Conturi bancare” dă 500 pe orice mediu nou (local, preview, un client nou pe altă bază).

Recomandare (de confirmat de owner, fiindcă atinge date reale):
1. **O singură ușă de import**: „Extrase bancare → Încarcă extras” (acceptă deja toate formatele).
   Celelalte butoane de import duc acolo.
2. **O singură coadă de potrivire**, în „Încasări”: fiecare linie de extras se potrivește cu o factură
   (încasare) sau cu o cheltuială (plată). Reconcilierea devine o filă a ei.
3. „Conturi bancare” rămâne doar lista conturilor (IBAN, bancă, sold), fără import propriu.
4. Tehnic: o migrare care creează `fin_bank_connections` și adaugă coloanele BankLink lipsă, cu heal în
   `sync-schema.ts`, ca să nu mai depindă de istoria bazei de prod.

Ce am făcut deja, fără risc: titlul `/cash` nu mai e al doilea „Încasări”, iar descrierea „Conturi
bancare” nu mai conține codul intern „GAP G2”.
