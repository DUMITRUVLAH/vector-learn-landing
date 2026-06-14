---
id: MASS-003
title: "Import bulk clienți/cheltuieli din CSV + raport per rând + re-try"
milestone: FIN
phase: "15"
status: pending
depends_on: [MASS-001, PARTY-001, SPEND-001]
spec: backlog/specs/MASS-003.md
branch: feat/FIN-mass
---

## Goal

Permite importul în masă al clienților (`fin_parties`) și cheltuielilor (`fin_spend_entries`)
din CSV prin interfața FinDesk. Job-ul rulează asincron folosind runner-ul din MASS-001, cu
validare per rând, raport detaliat și posibilitate de retry (FIN-CORE §1.15).

Două tipuri de import:
1. **Clienți CSV** (`csv_import_parties`) — câmpuri: name, idno, bank_account, email, phone, address
2. **Cheltuieli CSV** (`csv_import_spend`) — câmpuri: date, amount, currency, category, description, supplier_name

---

## User stories

- Ca **contabil**, vreau să import 200 de clienți dintr-un CSV primit de la bancă sau furnizor,
  fără să le introduc manual, pentru că economisesc ore de muncă repetitivă.
- Ca **director financiar**, vreau să văd care rânduri din CSV au eșuat (cu motivul exact),
  pentru că pot corecta CSV-ul și re-importa doar rândurile greșite.
- Ca **contabil**, vreau să import cheltuielile lunare dintr-un extras de cont CSV,
  pentru că nu vreau să introduc manual zeci de tranzacții.
- Ca **sistem**, vreau ca importul să fie idempotent pe baza IDNO (pentru clienți) și
  (date+amount+description) hash (pentru cheltuieli), pentru că re-upload-ul aceluiași CSV
  nu trebuie să creeze duplicate.

---

## Acceptance criteria

- [ ] AC1: `POST /api/fin/mass/import/parties` (multipart/form-data, câmp `file`):
  - Parsează CSV (separator virgulă sau punct-virgulă — auto-detect)
  - Coloane acceptate (case-insensitive, cu aliasuri RO/EN): `name/denumire`, `idno/cod_fiscal`,
    `bank_account/iban`, `email`, `phone/tel`, `address/adresa`
  - Coloana `name` este obligatorie; restul opționale
  - Creează job `fin_bulk_jobs` cu `job_type='csv_import_parties'`, `total_rows=N`
  - Creează câte un `fin_bulk_rows` per rând (exclusiv header), `external_ref=rowNumber`
  - Returnează imediat `{ jobId, totalRows }` și procesează asincron

- [ ] AC2: Procesorul CSV parties (apelat de `runBulkJob`):
  - Validare per rând: `name` prezent, `idno` valid (13 cifre) dacă furnizat, `email` valid dacă furnizat
  - Idempotent: dacă există deja `fin_parties` cu același `idno` (și idno != null/empty) → rândul `skipped`, `result_ref=partyId_existent`
  - La succes: INSERT `fin_parties` → `result_ref=partyId`
  - La eroare de validare: `status='fail'`, `error_message=detaliu`; nu intră în retry (eroare definitivă)
  - La eroare DB: intrată în retry (max 3x ca în MASS-001)

- [ ] AC3: `POST /api/fin/mass/import/spend` (multipart/form-data, câmp `file`):
  - Parsează CSV
  - Coloane acceptate: `date/data`, `amount/suma`, `currency/moneda`, `category/categorie`,
    `description/descriere`, `supplier_name/furnizor`
  - Coloane obligatorii: `date`, `amount`
  - Creează job `fin_bulk_jobs` cu `job_type='csv_import_spend'`, `total_rows=N`
  - Returnează imediat `{ jobId, totalRows }` și procesează asincron

- [ ] AC4: Procesorul CSV spend (apelat de `runBulkJob`):
  - Validare: `date` parsabil (ISO sau DD.MM.YYYY sau MM/DD/YYYY), `amount` număr pozitiv
  - `amount` → `amount_cents = Math.round(amount * 100)` (integer, cenți)
  - Idempotent: hash SHA-256 din `(date + amount_cents + description)` stocat în `fin_spend_entries.import_hash`;
    dacă hash există → `skipped`
  - La succes: INSERT `fin_spend_entries` cu `import_hash` → `result_ref=spendId`
  - `category` mapată la valori valide; dacă necunoscută → `'other'`

- [ ] AC5: `GET /api/fin/mass/jobs` și `GET /api/fin/mass/jobs/:jobId` — reutilizate din MASS-002
  (același endpoint, aceleași date) — nu se duplică.

- [ ] AC6: Pagina `/app/fin/mass` extinsă (față de MASS-002):
  - Tab „Import CSV" cu două sub-secțiuni: „Clienți" și „Cheltuieli"
  - Upload zone (drag-and-drop + click) pentru fiecare tip
  - Preview: primele 3 rânduri din CSV cu mapare auto-detectată a coloanelor
  - Buton „Importează" → POST → redirect la tab „Jobs" cu job-ul nou creat selectat
  - Raportul job-ului afișează: rând CSV, status, mesaj eroare (dacă fail/skip)

- [ ] AC7: Dependință CSV parser: `papaparse` (dacă nu e instalat → instalează). Nu folosi cod nativ
  fragil. PapaParse este deja în multe proiecte Vite — verifică `package.json` înainte de a instala.

- [ ] AC8: Design system tokens (fără hex). Light + dark mode. WCAG AA. Upload zone are
  `aria-label="Încarcă fișier CSV"` și acceptă drag-and-drop cu keyboard fallback.

- [ ] AC9: Tenant isolation — toate INSERT-urile setează `tenant_id` din sesiune (niciodată din body).

- [ ] AC10: Coloana `import_hash VARCHAR(64)` adăugată la `fin_spend_entries` (dacă nu există).
  Verifică schema din `server/db/schema/` — dacă `import_hash` lipsește, adaugă în schema TS și
  creează o migrare separată `0116_fin_spend_import_hash.sql` pe același branch.

---

## Files to create / modify

**Create:**
- `server/lib/finCsvImportProcessor.ts` — parsare CSV + procesoare parties + spend (folosind papaparse server-side sau csv-parse)
- `src/components/fin/CsvImportZone.tsx` — upload zone cu preview + validare client-side
- `src/__tests__/fin/fin-csv-import.test.ts` — teste unit (parsare, validare, idempotență)
- `server/__tests__/fin-mass-import.routes.test.ts` — teste rute import

**Modify:**
- `server/routes/finMass.ts` — adaugă POST /import/parties + POST /import/spend (multipart)
- `src/pages/fin/FinMassPage.tsx` — adaugă tab Import CSV + CsvImportZone
- `server/db/schema/finSpend.ts` (dacă există) — adaugă `import_hash`; altfel notează în raport
- `drizzle/0116_fin_spend_import_hash.sql` — migrare dacă `import_hash` lipsește din DB

---

## Tests

- **T-MASS-003-1** `[blocant]` Given CSV cu 3 rânduri parties valide, When POST /import/parties, Then job creat cu total_rows=3, returnează {jobId} imediat.
- **T-MASS-003-2** `[blocant]` Given procesorul rulează pe parties CSV, When rând valid fără IDNO duplicat, Then fin_party creat, rândul status='success'.
- **T-MASS-003-3** `[blocant]` Given parties CSV cu IDNO deja existent în DB, When procesor rulează, Then rândul status='skipped' (nu duplică).
- **T-MASS-003-4** `[blocant]` Given CSV cheltuieli cu amount invalid (text), When procesorul rulează, Then rândul status='fail' cu mesaj de eroare explicit, nu retry.
- **T-MASS-003-5** `[blocant]` API smoke: login + POST /api/fin/mass/import/parties cu CSV minimal → 200 cu {jobId}.
- **T-MASS-003-6** [normal] Parsare dată: "25.06.2026", "2026-06-25" și "06/25/2026" toate parsate corect la aceeași dată.
- **T-MASS-003-7** [normal] UI: CsvImportZone se randează fără crash; drag-and-drop zone are aria-label.
- **T-MASS-003-8** [normal] Given același CSV spend importat de 2 ori, When a doua importare, Then toate rândurile status='skipped' (hash idempotent).

---

## Definition of Done

- [ ] AC1–AC10 implementate
- [ ] T-MASS-003-1..5 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/app.ts montează /api/fin/mass (reutilizat din MASS-002)
- [ ] papaparse sau csv-parse instalat dacă lipsea
