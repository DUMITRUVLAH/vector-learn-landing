---
id: AGREEMENT-001
title: "Schema fin_agreements + fin_agreement_services + migrare 0116"
milestone: FIN
phase: "4"
status: in_progress
attempts: 1
depends_on: [PARTY-001]
spec: backlog/specs/AGREEMENT-001.md
branch: feat/FIN-agreement
---

## Goal

Definirea schemei DB pentru **contracte comerciale** (`fin_agreements`) și **serviciile/liniile**
contractului (`fin_agreement_services`). Un contract leagă tenantul cu un partener (`fin_parties`)
pentru prestarea unuia sau mai multor servicii, fiecare cu tip de facturare (`recurring` sau
`one_time`) și dată de emitere recurentă (`next_bill_date`). Această schemă stă la baza
modulului BILL (facturi) și generării automate de facturi recurente (AGREEMENT-002 → API;
AGREEMENT-003 → UI).

**Refolosire:** schema `fin_parties` (PARTY-001/PR#156) și tiparul schema+migrare din PAR-001.
Nu re-creăm nimic din ce există deja — FK spre `fin_parties.id` cu `onDelete: set null`
(partener poate fi șters fără a invalida contractele).

## User stories

- **Ca** contabil, **vreau** să înregistrez un contract cu un client sau furnizor, **pentru că**
  am nevoie să urmăresc obligațiile contractuale și să generez facturi automat.
- **Ca** director, **vreau** să văd ce servicii sunt incluse într-un contract și cât costă fiecare,
  **pentru că** vreau să verific corectitudinea facturării.
- **Ca** sistem, **vreau** să știu `next_bill_date` pentru fiecare serviciu recurent, **pentru că**
  motorul de billing va genera factura la data respectivă (BILL-001+).
- **Ca** admin, **vreau** să clasific serviciile ca `recurring` (ex. abonament lunar) sau `one_time`
  (ex. taxă de instalare), **pentru că** regulile de facturare diferă.

## Acceptance criteria

- [ ] `server/db/schema/finAgreements.ts` cu tabelele:
  - `fin_agreements`: id, tenantId, partyId (FK → fin_parties.id, onDelete set null, nullable),
    title (text NOT NULL), status (`draft` | `active` | `paused` | `cancelled`),
    startDate (date nullable), endDate (date nullable),
    currency (char 3, default `MDL`), notes (text nullable),
    createdAt, updatedAt
  - `fin_agreement_services`: id, agreementId (FK → fin_agreements.id, onDelete cascade),
    name (text NOT NULL), description (text nullable),
    billingType (`recurring` | `one_time`),
    unitPriceCents (int NOT NULL, in cents), quantity (int default 1), vatPct (int default 0),
    recurrencePeriod (`monthly` | `quarterly` | `yearly` | null),
    nextBillDate (date nullable), lastBilledAt (timestamp nullable),
    isActive (bool default true), createdAt, updatedAt
  - Indexuri: `fin_agreements_tenant_idx` (tenantId), `fin_agreements_party_idx` (tenantId, partyId),
    `fin_agreement_services_agreement_idx` (agreementId)
- [ ] `server/db/schema/index.ts` adaugă `export * from "./finAgreements"`
- [ ] Migrare `drizzle/0116_fin_agreements.sql` (prefix > 0115, statement-breakpoints corecte)
- [ ] `drizzle/meta/_journal.json` actualizat cu intrarea 0116
- [ ] Seed în `scripts/seed.ts`: 2 contracte demo cu câte 2 servicii fiecare (1 recurring + 1 one_time),
  legate de partenerii demo din PARTY-001 — idempotent (guard `if finAgreements is empty`)
- [ ] `npm run db:reset && npm run db:seed` reușesc fără eroare

## Files

**New:**
- `server/db/schema/finAgreements.ts` — schema fin_agreements + fin_agreement_services
- `drizzle/0116_fin_agreements.sql` — migrare manuală cu statement-breakpoints
- `src/__tests__/fin/agreement-001-schema.test.ts` — teste unit pe schema

**Modified:**
- `server/db/schema/index.ts` — adaugă `export * from "./finAgreements"`
- `scripts/seed.ts` — seed 2 contracte demo cu 4 servicii
- `drizzle/meta/_journal.json` — adaugă intrarea idx 0116

## Tests

- **T-AGREEMENT-001-1** [blocant] `finAgreements` și `finAgreementServices` exportate din `schema/index.ts`
- **T-AGREEMENT-001-2** [blocant] `fin_agreement_status` enum acceptă `draft`, `active`, `paused`, `cancelled`
- **T-AGREEMENT-001-3** [blocant] `fin_agreement_services.billingType` acceptă `recurring` și `one_time`
- **T-AGREEMENT-001-4** [blocant] Fișierul `drizzle/0116_fin_agreements.sql` există și conține `CREATE TABLE fin_agreements`
- **T-AGREEMENT-001-5** [normal] `fin_agreement_services` are câmpul `nextBillDate` definit în schema
- **T-AGREEMENT-001-6** [normal] `finAgreementServices` are câmpul `unitPriceCents` NOT NULL (int)

## DoD

- Schema compilează TypeScript strict, zero any
- Migrare 0116 corectă cu statement-breakpoints
- `server/db/schema/index.ts` conține exportul finAgreements
- check-undefined-refs + check-route-mounts verzi
- Toate testele T1-T6 verzi
