---
id: EXPORT-002
title: Export contabil structurat — 1C/SAGA + extensii XML/SAF-T avansat
milestone: FIN
phase: "21"
status: in_progress
depends_on: [EXPORT-001, FISC-002]
branch: feat/FIN-export
spec_version: 1
---

## Goal

Extinde platforma de export (EXPORT-001) cu formate suplimentare necesare contabililor din Moldova
și România: export XML pentru 1C:Accounting (format nativ moldovenesc), export structurat pentru
SAGA C (România), și o variantă extinsă SAF-T RO cu câmpuri fiscale suplimentare (TVA,
cod fiscal firmă). Refolosește `exportCsv.ts` + `exportSafT.ts` din EXPORT-001.

## User stories

- Ca contabil al academiei, vreau să export datele GL în format compatibil 1C, pentru că AMEF-ul
  nostru rulează 1C și importul manual durează 2 ore pe lună.
- Ca director financiar, vreau un SAF-T complet cu TVA și cod fiscal, pentru că ANAF RO cere
  declarație cu aceste câmpuri.
- Ca Andreea (director multi-filiale MD), vreau export SAGA pentru finanțistul extern, pentru că
  contabilii din România folosesc exclusiv SAGA C.
- Ca utilizator, vreau un singur endpoint API care listează formatele disponibile, pentru că UI-ul
  de export center (EXPORT-003) are nevoie de această listă.

## Acceptance criteria

1. `GET /api/fin/export/formats` → JSON cu array de formate disponibile (id, label, description, mime).
2. `GET /api/fin/export/1c-xml?from=&to=` → XML compatibil 1C:Accounting (encoding Windows-1251 via BOM
   sau UTF-8 cu declarație; tag-uri: `<Документ>`, `<Операция>`, `<Счет>`).
3. `GET /api/fin/export/saga-csv?from=&to=` → CSV delimitator `,` format SAGA C (jurnal Debit/Credit
   cu coloane: `Data,Cont,DenumireCont,Suma,TipOperatie,Descriere`).
4. `GET /api/fin/export/saf-t-ro-full?year=&period=` → SAF-T RO complet cu secțiunea `<TaxTable>` și
   câmpuri `<TaxCode>`, `<TaxPercentage>`, `<TaxType>`. Extinde `generateSafT` din EXPORT-001.
5. Toate endpoint-urile protejate cu `requireAuth`; tenant isolation prin `session.tenantId`.
6. Soft reference pattern (ca în EXPORT-001): dacă tabelele fin_* lipsesc → returnează format gol (200).
7. API client `src/lib/api/finExport.ts` extins cu `downloadOneCXml()`, `downloadSagaCsv()`,
   `downloadSaftRoFull()`, `getExportFormats()`.
8. Teste vitest: T-EXPORT-002-1..4 conform secțiunea Tests.

## Files

### New / modified
- `server/routes/finExport.ts` — adaugă 4 rute noi (formats, 1c-xml, saga-csv, saf-t-ro-full)
- `server/lib/fin/export1c.ts` — generator XML 1C (funcție pură, fără dependențe externe)
- `server/lib/fin/exportSaga.ts` — generator CSV SAGA C (funcție pură)
- `server/lib/fin/exportSafT.ts` — extinde `generateSafT` cu parametru opțional `includeTax`
- `src/lib/api/finExport.ts` — adaugă 4 funcții noi
- `src/__tests__/fin/export-002.test.ts` — teste noi

### No schema changes needed (reuse fin_ledger_entries, fin_accounts, fin_invoices din EXPORT-001)

## Tests

- **T-EXPORT-002-1** [blocant] Given server pornit și user autentificat, When GET /api/fin/export/formats, Then status 200 + JSON array cu cel puțin 6 formate (journal-csv, trial-balance-csv, invoices-sfs-csv, saf-t-ro-xml, 1c-xml, saga-csv).
- **T-EXPORT-002-2** [blocant] Given `generate1cXml([{date,ref,account,debit,credit}])`, When apelat direct, Then string XML conține `<Документ>` și `<Счет>`.
- **T-EXPORT-002-3** [blocant] Given `generateSagaCsv([{date,account,accountName,amount,type,description}])`, When apelat direct, Then prima linie = header cu `Data,Cont,DenumireCont,Suma,TipOperatie,Descriere`.
- **T-EXPORT-002-4** [normal] Given `generateSafT(accounts, entries, { includeTax: true })`, When apelat, Then XML include tag `<TaxTable>` sau `<TaxCode>`.
- **T-EXPORT-002-5** [normal] Given endpoint /api/fin/export/1c-xml fără tabele fin_*, When GET, Then status 200 + Content-Type application/xml + body XML valid (cel puțin tag rădăcină).

## DoD

- [ ] 4 endpoint-uri noi montate în app.ts (via finExportRoutes existent)
- [ ] `getExportFormats()` returnează lista cu 6+ formate
- [ ] Generatoare 1C XML + SAGA CSV sunt funcții pure testabile
- [ ] SAF-T extins include `<TaxTable>` când `includeTax: true`
- [ ] Soft reference: fără fin_* tabele → 200 cu body gol/minim valid
- [ ] Toate cele 5 teste vitest trec
- [ ] Build + typecheck + lint fără erori noi
- [ ] Static guards (check-route-mounts, check-undefined-refs) verzi
