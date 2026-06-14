---
id: EXPORT-001
title: "Export contabil structurat — jurnale/balanță/facturi în CSV/XML pentru 1C/SAGA + SAF-T RO / format SFS MD"
milestone: FIN
phase: "21"
status: pending
depends_on: [LEDGER-002]
spec: backlog/specs/EXPORT-001.md
branch: feat/FIN-export
---

## Goal

Modul de export contabil structurat (GAP-ANALYSIS G5) care permite descărcarea datelor
financiare în formate standard pentru import în sisteme contabile externe (1C, SAGA, Ciel)
și pentru raportare fiscală (SAF-T RO simplificat, format SFS Moldova).

Refolosește datele existente:
- Jurnale GL din `fin_ledger_entries` + `fin_accounts` (LEDGER-002, pe branch-ul feat/FIN-ledger)
- Declarații fiscale din `fin_tax_declarations` + `fin_tax_periods` (FISC-002, pe branch-ul feat/FIN-fisc)
- Facturi din `fin_invoices` + `fin_invoice_lines` (dacă tabelele există — soft reference)

Soft reference pattern: dacă o tabelă dependentă nu există pe branch-ul curent, returnează
array gol pentru acel tip de export (nu 500).

---

## User stories

- Ca **contabil**, vreau să exportez jurnalul contabil în CSV structurat compatibil cu 1C/SAGA,
  pentru că introduc manual datele de 2 ori pe lună și pierd ore.
- Ca **director financiar**, vreau să generez un fișier SAF-T RO simplificat (XML) cu planul
  de conturi + jurnale, pentru că controlul fiscal cere acest format.
- Ca **responsabil SFS Moldova**, vreau să export facturile perioadei în format CSV conform
  cerințelor SFS (TVA12, e-Factura), pentru că depun declarațiile lunar.
- Ca **administrator**, vreau să descarc balanța de verificare a perioadei în Excel/CSV,
  pentru că auditorul extern o cere trimestrial.

---

## Acceptance criteria

- [ ] AC1: Router `finExportRoutes` (Hono) montat în `server/app.ts` la `/api/fin/export`.

  Endpoint-uri:
  - `GET /journal` — export jurnal GL în CSV (filtre: `from`, `to`, `account_code`).
    Coloane: date, ref, description, account_code, account_name, debit_cents, credit_cents.
  - `GET /trial-balance` — balanță de verificare în CSV la data `?as_of=YYYY-MM-DD`.
    Coloane: account_code, account_name, class, opening_debit, opening_credit,
    period_debit, period_credit, closing_debit, closing_credit.
  - `GET /invoices-sfs` — facturi pentru SFS Moldova în CSV (coloane: seria, numar, data,
    cumparator_idno, cumparator_name, total_fara_tva, tva_12, total_cu_tva).
    Filtre: `from`, `to`. Soft reference — gol dacă fin_invoices absent.
  - `GET /saf-t-ro` — SAF-T RO simplificat în format XML (plan de conturi + jurnale).
    Filtre: `year`, `period` (1–12 sau Q1–Q4).
    Nu implementează SAF-T complet — doar Header + MasterFiles/Accounts + GeneralLedger.

- [ ] AC2: Toate endpoint-urile setează `Content-Disposition: attachment; filename=...` și
  `Content-Type: text/csv; charset=utf-8` (sau `application/xml` pentru SAF-T).

- [ ] AC3: **CSV** — delimiter `;`, encoding UTF-8 BOM (pentru compatibilitate Excel RO/MD).
  Prima linie = header. Valorile monetare în lei cu 2 zecimale (ex: `1234.56`).

- [ ] AC4: **SAF-T RO XML** — structură minimă:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:RO">
    <Header>...</Header>
    <MasterFiles>
      <GeneralLedgerAccounts>
        <Account>...</Account>
      </GeneralLedgerAccounts>
    </MasterFiles>
    <GeneralLedgerEntries>
      <Journal>...</Journal>
    </GeneralLedgerEntries>
  </AuditFile>
  ```
  Namespace corect `urn:StandardAuditFile-Taxation-Financial:RO`. Nu necesită librărie XML externă
  — generare cu template strings (șabloane).

- [ ] AC5: Tenant isolation pe toate endpoint-urile. `requireAuth`. Zero raw `.execute().rows`.

- [ ] AC6: API client `src/lib/api/finExport.ts` cu funcții tipizate pentru download
  (returnează Blob pentru descărcare în browser).

- [ ] AC7: Soft reference — dacă `fin_invoices` nu există la runtime (branch-ul curent nu are
  BILLING mersat), `GET /invoices-sfs` returnează CSV cu header dar zero rânduri (200, nu 500).

---

## Files to create / modify

**Create:**
- `server/routes/finExport.ts`
- `server/lib/fin/exportCsv.ts` — helper pentru generare CSV (encodare, BOM, formatare)
- `server/lib/fin/exportSafT.ts` — helper pentru generare SAF-T RO XML
- `src/lib/api/finExport.ts` — client API tipizat
- `src/__tests__/fin/export-001.test.ts` — teste unitare

**Modify:**
- `server/app.ts` — montare `finExportRoutes` la `/api/fin/export`

---

## Tests

- **T-EXPORT-001-1** `[blocant]` Given POST /api/auth/login + GET /api/fin/export/journal?from=2025-01-01&to=2025-12-31, Then 200 + Content-Type text/csv.
- **T-EXPORT-001-2** `[blocant]` Given export journal cu 2 înregistrări GL, Then CSV are header + 2 rânduri, debit+credit corecte.
- **T-EXPORT-001-3** `[blocant]` Given export saf-t-ro cu plan de conturi seeded, Then XML valid cu tag AuditFile + Header + Account.
- **T-EXPORT-001-4** `[blocant]` Given fin_invoices absent, When GET /invoices-sfs, Then 200 cu CSV header dar zero rânduri (nu 500).
- **T-EXPORT-001-5** [normal] Given trial-balance as_of=2025-06-30, Then CSV are coloanele corecte și suma debit=credit (bilanț echilibrat).
- **T-EXPORT-001-6** [normal] Given jurnal cu tenant B, Then export returnează doar înregistrările tenant-ului B (tenant isolation).

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T4 [blocante] trec
- [ ] Router montat în app.ts
- [ ] Build + typecheck + lint verzi
- [ ] Static guards verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
