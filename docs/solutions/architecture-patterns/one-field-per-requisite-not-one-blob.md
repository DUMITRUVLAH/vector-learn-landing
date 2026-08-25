---
title: Un câmp per rechizit — un blob extras nu se stochează ca text liber
problem_type: data-modelling / extraction
module: PAR (par_vendors, parAiPrefill, stubPartyParser)
tags: [extraction, ocr, moldova, iban, bic, cod-fiscal, tva, registru-beneficiari]
symptoms: "tot e intro linie la tine; aici tre sa fie colonita separata pt cod idno si cod tva, cod bancar"
severity: high
date: 2026-08-25
---

## Simptom

În registrul de beneficiari (`/business/par/admin` → Date referință → Beneficiari / Furnizori)
coloana „Bancă" a unui rând arăta așa:

```
BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.
```

Contabila nu putea nici filtra, nici copia vreun cod: banca, codul bancar (BIC), codul fiscal și
nr. TVA erau un singur șir de text. Raportat pe WhatsApp cu o captură din aplicație.

## Cauza reală

Pe documentele moldovenești rechizitele se tipăresc pe UN rând. Extractorul
(`stubPartyParser.cleanBankName`) tăia numele băncii doar la **etichete** cunoscute
(`cod bancar`, `BIC`, `IBAN`, `cod fiscal`, …). În documentul de mai sus codul bancar
`AGRNMD2X885` e **neetichetat** — stă pur și simplu după numele filialei — deci regula de tăiere
nu se declanșa și tot restul rândului intra în `payee_bank`, apoi în `par_vendors.bank`.

Al doilea strat de cauză: **modelul de date lipsea o coloană**. `par_vendors` avea `idnp` și
`bic_swift`, dar nu și `vat_code`. Ce nu are unde să fie pus rămâne în blob.

## Fix

1. **Un separator pur, unul singur** — `server/lib/par/bankRequisites.ts` →
   `splitBankRequisites(raw)` → `{ bank, bankCode, fiscalCode, vatCode, iban }`. Fără I/O,
   determinist, testat pe șirul real din producție.
2. **Folosit în TOATE cele trei porți de intrare**, ca regula să nu se bifurce:
   `stubPartyParser.cleanBankName` (extragere), `routes/parVendors.ts` (orice scriere) și
   `lib/par/vendorAutoSave.ts` (auto-salvarea din cerere).
3. **Coloana lipsă** — migrarea `0142_par_vendor_vat_code.sql` + `vatCode` în schemă; tabelul din
   admin are acum Nume · Cod fiscal/IDNO · Cod TVA · IBAN · Cod bancar · Bancă.
4. **Istoricul** — `POST /api/par/vendors/actions/normalize` trece rândurile deja salvate prin
   același separator. Idempotent (un rând curat nu produce niciun cod → e sărit).

## Reguli de reținut

- **Un cod cu formă proprie se recunoaște după FORMĂ, nu doar după etichetă.** BIC-ul e ISO 9362
  (`AAAABBCC[DDD]`), IBAN-ul ISO 13616. Tăierea doar pe etichete ratează exact cazurile de OCR.
- **Cere un discriminator când forma e ambiguă.** „EXIMBANK" are exact forma unui BIC de 8
  caractere. Un BIC neetichetat se acceptă doar dacă are cel puțin o cifră (partea de localizare
  a oricărui BIC moldovenesc o are). Mai bine null decât un cod inventat.
- **Enrich, nu clobber.** Un cod dedus dintr-un text lipit completează doar un câmp gol; nu
  rescrie niciodată un IBAN/cod salvat — schimbarea unui IBAN redirecționează bani. La `PATCH`
  se citește rândul curent ÎNAINTE de separare, tocmai pentru asta.
- **Nu tăia punctul final.** Curățarea cozii de separatori (`,;:/ -`) nu are voie să includă `.`,
  altfel „BC X S.A." devine „BC X S.A".
- **O cale de acțiune cu două segmente scapă de `parUuidGuard`.** `use("/:id", parUuidGuard)`
  prinde orice cale de UN segment, deci `POST /vendors/normalize` ar fi întors 404;
  `/vendors/actions/normalize` nu e confundată cu un id.

## Capcană de UI descoperită la testare

`ParReferenceData` întoarce un spinner cât timp `loading` e `true`, deci **demontează**
`VendorSection` la fiecare reîncărcare. Mesajul „N beneficiari au fost separați" ținut în starea
locală a secțiunii dispărea instantaneu după reparare. Starea acțiunii trebuie să stea în
componenta care NU se demontează la reload (părintele). Regulă generală: *o stare care trebuie să
supraviețuiască unui refetch nu are ce căuta într-o componentă pe care refetch-ul o demontează.*

## Cum se verifică

```bash
npx vitest run server/lib/par/__tests__/bankRequisites.test.ts \
                server/__tests__/par-vendor-requisites.routes.test.ts \
                src/pages/par/__tests__/ParAdmin.vendorColumns.test.tsx

# în browser real, pe un server pornit + seed:
BASE_URL=http://localhost:3141 node scripts/e2e-par-vendor-columns.mjs
```
