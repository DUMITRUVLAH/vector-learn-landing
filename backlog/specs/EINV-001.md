---
id: EINV-001
title: "Schema fin_einvoices + fin_sfs_settings (secrets AES-256-GCM) + migration 0118"
milestone: FIN
phase: "6"
status: pending
attempts: 0
depends_on: [BILL-001]
spec: backlog/specs/EINV-001.md
branch: feat/FIN-einv
---

## Goal

Defineşte schema DB pentru **e-Factura Moldova (SFS) în contextul FinDesk** — adică pentru
facturile B2B din `fin_invoices`, NU pentru tabelul `invoices` (B2C, care deja are coloana
`efactura_md_*` din EFMD). Creează:

1. **`fin_einvoices`** — tracking trimitere e-Factura SFS per factură B2B (fin_invoices). Status
   SFS (`pending / sent / accepted / rejected / cancelled`), câmpuri SOAP response, dată ultimului sync.
2. **`fin_sfs_settings`** — setări per tenant: `idno`, `bankAccount`, `environment` (mock/test/prod),
   credențiale criptate cu AES-256-GCM via `server/lib/crypto.ts` (NICIODATĂ base64 raw).

Migrarea `0118_fin_einvoices.sql` — prefix 0118 confirmat liber (max pe main = 0117).

FIN-CORE §1.6: „e-Factura este opțional, activabil per tenant, credențiale criptate."

## User stories

- **Ca** contabil, **vreau** să văd statusul SFS al fiecărei facturi B2B (sent/accepted/rejected),
  **pentru că** trebuie să știu dacă fiscul a primit factura.
- **Ca** admin tenant, **vreau** să configurez credențialele SFS o singură dată,
  **pentru că** nu vreau să le introduc la fiecare trimitere.
- **Ca** sistem, **vreau** să stocheze secretele criptate AES-256-GCM,
  **pentru că** CLAUDE.md §3.5.1: „secrets at rest use AES-256-GCM, never base64".
- **Ca** director, **vreau** să pot alege environment mock/test/prod per tenant,
  **pentru că** testez fluxul înainte de a trimite la fiscul real.

## Acceptance criteria

### Schema `server/db/schema/finEinvoices.ts`

- [ ] `fin_sfs_settings` table:
  - `id` UUID PK, `tenantId` UUID NOT NULL unique (FK → tenants onDelete cascade)
  - `idno` varchar(13) NOT NULL — IDNO-ul furnizorului (academiea)
  - `bankAccount` varchar(34) NOT NULL — contul bancar (IBAN sau cont bancar SFS)
  - `environment` enum: `mock | test | prod` (default `mock`)
  - `usernameEncrypted` text nullable — AES-256-GCM encrypted (via `server/lib/crypto.ts`)
  - `passwordEncrypted` text nullable — AES-256-GCM encrypted
  - `lastTestedAt` timestamp nullable — data ultimului test de conectivitate
  - `createdAt`, `updatedAt` timestamps

- [ ] `fin_einvoices` table:
  - `id` UUID PK
  - `tenantId` UUID NOT NULL (FK → tenants onDelete cascade)
  - `finInvoiceId` UUID NOT NULL unique (FK → fin_invoices.id onDelete cascade)
  - `sfsStatus` enum: `pending | sent | accepted | rejected | cancelled` (default `pending`)
  - `sfsSerialNumber` varchar(50) nullable — seria atribuită de SFS
  - `sfsInvoiceId` varchar(100) nullable — ID intern SFS
  - `sfsRequestStatus` integer nullable — câmpul Status din response SOAP
  - `sfsErrorMessage` text nullable — mesaj eroare dacă a eșuat
  - `submittedAt` timestamp nullable — data trimiterii
  - `lastSyncAt` timestamp nullable — data ultimului sync status
  - `createdAt`, `updatedAt` timestamps
  - Index: `(tenantId, sfsStatus)`, `(finInvoiceId)`

- [ ] Migrare `drizzle/0118_fin_einvoices.sql`:
  - Creează enum `fin_sfs_env`, enum `fin_einvoice_status`
  - Creează `fin_sfs_settings`, `fin_einvoices`
  - Statement breakpoints `--> statement-breakpoint` între fiecare statement (CLAUDE.md §3.5.1)
  - Prefix 0118 > max 0117 pe main

- [ ] `server/db/schema/index.ts` — export `* from "./finEinvoices";`

### Validare crypto

- [ ] La seed/test: `encryptAES256GCM("test")` returneaza string nenul; `decryptAES256GCM(encrypted)` returneaza `"test"`
- [ ] Dacă `CRYPTO_SECRET_KEY` lipseste din `.env` → funcțiile aruncă eroare clară, nu silent-fail

## Files to create / modify

- `server/db/schema/finEinvoices.ts` — schema cele 2 tabele + enums
- `server/db/schema/index.ts` — adaugă export
- `drizzle/0118_fin_einvoices.sql` — migrare SQL
- `drizzle/meta/_journal.json` — append entry idx 118
- `server/__tests__/einv-schema.test.ts` — smoke: import schema fără crash + crypto roundtrip

## Tests

- **T-EINV001-1** [blocant] Given migration 0118 applied, When `db:reset && db:seed`, Then succeeds without error
- **T-EINV001-2** [blocant] Given `finEinvoices` and `finSfsSettings` imported from schema/index, When referenced in code, Then not undefined (schema index export present)
- **T-EINV001-3** [blocant] Given `server/lib/crypto.ts` AES-256-GCM, When encrypt→decrypt roundtrip on password, Then returns original string
- **T-EINV001-4** [normal] Given fin_sfs_settings row with environment='mock', When queried, Then environment enum validates correctly
- **T-EINV001-5** [normal] Given migration SQL, When checked for statement-breakpoints, Then each multi-statement section has `--> statement-breakpoint`
- **T-EINV001-6** [blocant] Given `_journal.json`, When idx 118 entry checked, Then idx=118, no duplicate idx in journal

## DoD

- Migration prefix 0118 conflict-free
- `db:reset && db:seed` green
- Schema index export present
- Crypto roundtrip test passes
- Reviewer APPROVED
- integration-architect CONNECTED
- Persona reports saved
- PR pe feat/FIN-einv (branch nou din origin/main)
