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
| NAV-08 | IT Park: modulul întreg rutat în `/business/fin/itpark/*` (azi doar detaliul, rupt) | în lucru |

## Backlog descoperit (nu intră în faza asta)

- Contractul din CRM se leagă de un partener FinDesk (`fin_parties`), nu de firma din CRM
  (`crm companies`). Un contract pornit din fișa clientului CRM ar trebui să preia firma automat.
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
