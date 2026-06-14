---
id: BANKLINK-001
title: "BankLink — schema fin_bank_connections + import OFX/MT940 programat + dedup + seed"
milestone: FIN
phase: "18"
status: pending
depends_on: [CASH-001]
spec: backlog/specs/BANKLINK-001.md
branch: feat/FIN-banklink
---

## Goal

Construiește fundația modulului BankLink (GAP-ANALYSIS G2) — conectori bancari pentru import
automat de extrase bancare, eliminând introducerea manuală a tranzacțiilor.

1. **Schema** — tabele `fin_bank_connections` (configurare conector per bancă) și
   `fin_bank_transactions` (tranzacții importate, deduplate).
2. **Import OFX/MT940** — parser minimal pentru fișiere OFX (Open Financial Exchange) și
   MT940 (SWIFT statement), plus un endpoint `POST /api/fin/banklink/import` care acceptă un
   fișier text și inserează tranzacțiile noi (dedup pe `external_id`).
3. **Dedup** — fiecare tranzacție are un `external_id` (din fișier); duplicate check pe
   `(bank_connection_id, external_id)` — nu inserăm de două ori aceeași tranzacție.
4. **Seed** — date demo: 2 conexiuni bancare + 5 tranzacții importate pentru tenant demo.
5. **Rute** — CRUD connections + listare tranzacții + import upload.

GAP-ANALYSIS G2: concurența (alte CRM-uri educaționale) nu are integrare bancară — acesta e
un diferențiator major pentru Andreea (6 locații, ~1400 studenți, extrase bancare multiple).

---

## User stories

- Ca **director financiar**, vreau să import extrasul bancar OFX din online banking în 2 click-uri,
  pentru că reconcilierea manuală a 200+ tranzacții/lună durează o zi întreagă.
- Ca **contabil**, vreau ca sistemul să nu importe duplicate când download-uiesc extrasul de două ori,
  pentru că nu vreau să corectez manual tranzacții duble.
- Ca **sistem**, vreau să pot configura mai mulți conectori (câte un cont bancar per filială),
  pentru că Andreea are 6 locații cu conturi diferite.

---

## Acceptance criteria

- [ ] AC1: `fin_bank_connections` — configurare conexiune bancară per tenant:
  `id UUID PK`, `tenant_id UUID FK tenants`, `name TEXT NOT NULL` (ex: "BC Maib — Cont Principal"),
  `bank_code VARCHAR(30)` (ex: "MAIB", "MOBIASBANCĂ", "VICBANK"),
  `account_iban VARCHAR(34)`, `currency VARCHAR(3) DEFAULT 'MDL'`,
  `import_format VARCHAR(20) DEFAULT 'OFX'` (OFX|MT940|CSV),
  `is_active BOOLEAN DEFAULT true`,
  `last_import_at TIMESTAMP`, `created_at`, `updated_at`.
  Index pe `(tenant_id)`.

- [ ] AC2: `fin_bank_transactions` — tranzacții importate:
  `id UUID PK`, `bank_connection_id UUID FK fin_bank_connections`,
  `tenant_id UUID FK tenants`,
  `external_id VARCHAR(100) NOT NULL` (ID unic din fișier OFX/MT940),
  `transaction_date DATE NOT NULL`,
  `value_date DATE`,
  `amount_cents BIGINT NOT NULL` (negativ = debit, pozitiv = credit),
  `currency VARCHAR(3) DEFAULT 'MDL'`,
  `description TEXT`,
  `counterparty_name TEXT`,
  `counterparty_iban VARCHAR(34)`,
  `reference VARCHAR(100)`,
  `status VARCHAR(20) DEFAULT 'unmatched'` (unmatched|matched|ignored),
  `matched_source_type VARCHAR(30)`, `matched_source_id UUID`,
  `imported_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  `created_at`.
  Index unic pe `(bank_connection_id, external_id)` (dedup).
  Index pe `(tenant_id, transaction_date)` și `(tenant_id, status)`.

- [ ] AC3: Migration `0125_fin_banklink.sql` — creează cele 2 tabele, statement-breakpoints
  între instrucțiuni. Prefix 125 e peste 124 (fin_ledger) — fără coliziune.

- [ ] AC4: **Parser OFX minimal** — `server/lib/finBankParser.ts`:
  Funcție `parseOFX(text: string): ParsedTransaction[]` care extrage din format OFX 1.x (SGML):
  `{ externalId, transactionDate, valueDate, amountCents, description, counterpartyName, reference }`.
  Funcție `parseMT940(text: string): ParsedTransaction[]` pentru format MT940 (linii :61:/:86:).
  ParsedTransaction are toate câmpurile de mai sus ca string/number.

- [ ] AC5: **Rute** — `server/routes/finBankLink.ts` (nou, exportat + montat în app.ts):
  - `GET /api/fin/banklink/connections` — lista conexiunilor tenant-ului (active).
  - `POST /api/fin/banklink/connections` — creare conexiune nouă. Body: name, bankCode, accountIban,
    currency, importFormat.
  - `DELETE /api/fin/banklink/connections/:id` — dezactivare (is_active=false, nu ștergere).
  - `GET /api/fin/banklink/transactions?connectionId=&status=&from=&to=&page=&limit=` — listare
    tranzacții importate, paginată (50/pagină).
  - `POST /api/fin/banklink/import` — upload fișier OFX/MT940:
    Body: `{ connectionId: UUID, format: "OFX"|"MT940", content: string }`.
    Parse → dedup (skip dacă external_id există deja) → insert noi → returnează
    `{ imported: N, duplicates: M, errors: [...] }`.
  Toate cu requireAuth + tenant isolation.

- [ ] AC6: **Seed** — `server/lib/finBankLinkSeed.ts`: funcție `seedBankLink(tenantId)` care
  inserează 2 conexiuni demo (MAIB + Moldindconbank) și 5 tranzacții demo (diverse statusuri).
  Idempotent (skip dacă există). Apelabilă din `seedDemo.ts` sau direct.

- [ ] AC7: Schema exports în `server/db/schema/index.ts`. Zero `any`. Zero raw `.execute().rows`.

---

## Files to create / modify

**Create:**
- `server/db/schema/finBankLink.ts`
- `server/lib/finBankParser.ts`
- `server/lib/finBankLinkSeed.ts`
- `server/routes/finBankLink.ts`
- `drizzle/0125_fin_banklink.sql`
- `src/__tests__/fin/fin-banklink-001.test.ts`

**Modify:**
- `server/db/schema/index.ts` — add `export * from "./finBankLink";`
- `server/app.ts` — mount `finBankLinkRoutes` at `/api/fin/banklink`
- `drizzle/meta/_journal.json` — append idx 125

---

## Tests

- **T-BANKLINK-001-1** `[blocant]` Given schema finBankLink exportat, When import finBankConnections, Then tabelul e definit cu coloanele corecte.
- **T-BANKLINK-001-2** `[blocant]` Given OFX text cu 3 tranzacții, When parseOFX(text), Then returnează array de 3 ParsedTransaction cu externalId, amountCents, transactionDate.
- **T-BANKLINK-001-3** `[blocant]` Given MT940 text cu 2 tranzacții, When parseMT940(text), Then returnează 2 ParsedTransaction.
- **T-BANKLINK-001-4** `[blocant]` finBankLinkRoutes exportat din routes/finBankLink.ts.
- **T-BANKLINK-001-5** `[blocant]` Given import cu tranzacție duplicat (același external_id), When POST /api/fin/banklink/import a doua oară, Then duplicates=1, imported=0 (fără insert dublu).
- **T-BANKLINK-001-6** [normal] seedBankLink inserează 2 conexiuni + 5 tranzacții și e idempotentă.

---

## Definition of Done

- [ ] AC1–AC7 implementate
- [ ] T1–T5 [blocante] trec
- [ ] Migration 0125 cu statement-breakpoints + _journal.json actualizat
- [ ] Export în schema/index.ts + route montat în app.ts
- [ ] Build + typecheck verzi
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
