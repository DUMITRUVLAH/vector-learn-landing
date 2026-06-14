---
id: EINV-002
title: "API trimitere SFS e-Factura: REUSE EfacturaMdClient, status pending/sent/accepted, env mock/test/prod"
milestone: FIN
phase: "6"
status: pending
attempts: 0
depends_on: [EINV-001, BILL-002]
spec: backlog/specs/EINV-002.md
branch: feat/FIN-einv
---

## Goal

Adaugă endpoint-urile API pentru **trimiterea facturilor B2B FinDesk la SIA e-Factura Moldova (SFS)**,
REFOLOSIND complet `server/lib/efacturaMoldova.ts` (livrat în EFMD, PR #144). Nu se reconstruiește
SOAP client — se importă `EfacturaMdClient` și se adaptează pentru contextul `fin_invoices`.

Diferența față de EFMD (care lucra pe `invoices` B2C): EINV-002 lucrează pe `fin_invoices` (B2B) și
citește credențialele din `fin_sfs_settings` (EINV-001), nu din `.env` global.

Integration-architect trebuie să marcheze CONNECTED, nu COMPETING_SYSTEM — totul e reuse, nu rebuild.

## User stories

- **Ca** contabil, **vreau** să trimit o factură B2B la SFS cu un click,
  **pentru că** fiscul Moldovei cere raportare electronică a facturilor B2B.
- **Ca** sistem, **vreau** să verific statusul SFS al facturilor trimise,
  **pentru că** contabilul trebuie să știe dacă factura a fost acceptată.
- **Ca** admin, **vreau** să configurez environment mock/test/prod per tenant,
  **pentru că** testez cu date simulate înainte de a trimite la fiscul real.
- **Ca** contabil, **vreau** să anulez o factură trimisă la SFS,
  **pentru că** uneori emit facturi greșite care trebuie anulate.

## Acceptance criteria

### Nou router `server/routes/finEinvoices.ts`

- [ ] `POST /api/fin/einvoices/:invoiceId/submit`
  - Citește `fin_sfs_settings` pentru tenant (dacă lipsesc → 400 `sfs_not_configured`)
  - Decryptează credențialele cu `decrypt()` din `server/lib/crypto.ts`
  - Construiește config `EfacturaMdConfig` din setările tenantului (nu din `.env`)
  - Instantiază `EfacturaMdClient` cu config + transport real sau mock
  - Apelează `client.postInvoices(xml)` cu XML generat de `generateSfsInvoiceXml()`
  - Creează sau actualizează rândul din `fin_einvoices`: `sfsStatus = 'sent'`, `submittedAt = now()`
  - Dacă SFS returnează eroare → `sfsStatus = 'pending'`, `sfsErrorMessage` setat, răspuns 422
  - Dacă factura a mai fost trimisă (`sfsStatus != 'pending'`) → 409 `already_submitted`
  - Returnează `{ data: { id, sfsStatus, submittedAt } }`

- [ ] `POST /api/fin/einvoices/:invoiceId/sync`
  - Apelează `client.getInvoiceStatus(sfsInvoiceId)` → actualizează `sfsStatus` + `lastSyncAt`
  - Dacă nu există rând în `fin_einvoices` → 404
  - Returnează statusul actualizat

- [ ] `POST /api/fin/einvoices/:invoiceId/cancel`
  - `sfsStatus` trebuie să fie `sent | accepted` — altfel 409
  - Apelează `client.cancelInvoice(sfsInvoiceId)` → `sfsStatus = 'cancelled'`
  - Returnează `{ data: { id, sfsStatus } }`

- [ ] `GET /api/fin/einvoices/:invoiceId`
  - Returnează rândul `fin_einvoices` cu statusul SFS + timestamps
  - 404 dacă nu există sau nu aparține tenantului

- [ ] `GET /api/fin/sfs-settings` + `PUT /api/fin/sfs-settings`
  - GET: returnează setările (fără câmpurile `*Encrypted`; include `hasCredentials: bool`)
  - PUT: acceptă `{ idno, bankAccount, environment, username?, password? }`
    - Dacă `username`/`password` furnizate: criptează cu `encrypt()` și stochează
    - Upsert pe `tenantId`
  - Returnează `{ data: { id, idno, bankAccount, environment, hasCredentials, lastTestedAt } }`

### Montare în `server/app.ts`

- [ ] `import { finEinvoicesRoutes } from "./routes/finEinvoices";`
- [ ] `app.route("/api/fin", finEinvoicesRoutes);` (rute relative: `/einvoices/:id/...`, `/sfs-settings`)

### Reuse — NICIO reimplementare SOAP

- [ ] Importă din `"../lib/efacturaMoldova"`: `EfacturaMdClient`, `generateSfsInvoiceXml`,
  `EfacturaMdConfig`, `createMockTransport`
- [ ] Dacă `fin_sfs_settings.environment == 'mock'` → folosește `createMockTransport()`
- [ ] Dacă `environment == 'test'` sau `'prod'` → folosește transport HTTP real din `EfacturaMdClient`

### Securitate

- [ ] Webhook/callback handlers (dacă există) resping orice cerere fără token valid — 400 (CLAUDE.md §3.5.1)
- [ ] Credențialele stocate NICIODATĂ ca base64 raw — doar `encrypt()` din `server/lib/crypto.ts`
- [ ] Toate rutele cer `requireAuth` — zero rute publice

### TypeScript

- [ ] Strict — zero `any` nou în fișierele create
- [ ] Props interfaces pentru orice componente noi

## Files to create / modify

- `server/routes/finEinvoices.ts` — router nou cu 5 endpoint-uri
- `server/app.ts` — mount `finEinvoicesRoutes`
- `server/__tests__/finEinvoices.test.ts` — unit tests cu mock transport

## Tests

- **T-EINV002-1** [blocant] Given finEinvoices router mounted in app.ts, When `POST /api/fin/einvoices/:id/submit` called without auth, Then returns 401
- **T-EINV002-2** [blocant] Given sfs_settings missing for tenant, When submit called, Then returns 400 `sfs_not_configured`
- **T-EINV002-3** [blocant] Given environment='mock', When submit called, Then EfacturaMdClient uses mock transport (no real HTTP); fin_einvoices row created with sfsStatus='sent'
- **T-EINV002-4** [normal] Given invoice already submitted (sfsStatus='sent'), When submit called again, Then returns 409 `already_submitted`
- **T-EINV002-5** [blocant] Given finEinvoicesRoutes imported from server/routes/finEinvoices, When mounted in app.ts, Then route `/api/fin/einvoices/:id/submit` exists (route-mount guard)
- **T-EINV002-6** [blocant] Given integration-architect review, When SOAP client usage checked, Then REUSE `EfacturaMdClient` (CONNECTED, not COMPETING_SYSTEM)
- **T-EINV002-7** [normal] Given PUT /api/fin/sfs-settings with username+password, When stored, Then fields stored encrypted (not plaintext), GET returns hasCredentials=true

## DoD

- `server/routes/finEinvoices.ts` creat, montat în app.ts
- SOAP client REFOLOSIT (nu reimplementat) — integration-architect CONNECTED
- Credențiale criptate AES-256-GCM
- Unit tests verzi cu mock transport
- Static guards (route-mounts, undefined-refs) verzi
- Reviewer APPROVED
- Persona reports saved
- PR pe feat/FIN-einv (aceeași ramură ca EINV-001)
