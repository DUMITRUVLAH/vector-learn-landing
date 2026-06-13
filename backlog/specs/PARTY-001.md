---
id: PARTY-001
title: "Schema fin_parties + fin_party_contacts + migrare 0115"
milestone: FIN
phase: "3"
status: pending
attempts: 0
depends_on: [CORE-001, REGISTRY-001]
spec: backlog/specs/PARTY-001.md
branch: feat/FIN-party
---

## Goal

Definirea schemei DB pentru **parteneri comerciali** (clienți, furnizori, ambii) și **contactele**
lor asociate. Partenerii sunt entități externe cu care tenantul face afaceri: emite facturi (client),
primește facturi (supplier) sau ambele. Această schemă stă la baza modulelor AGREEMENT (contracte),
BILL (facturi de vânzare) și SPEND (cheltuieli).

## User stories

- **Ca** contabil, **vreau** să înregistrez un partener nou cu IDNO/CIF și IBAN, **pentru că** am
  nevoie de datele fiscale corecte pe facturi.
- **Ca** owner, **vreau** să clasific partenerii ca client/supplier/both, **pentru că** vreau rapoarte
  separate pe venituri și cheltuieli.
- **Ca** admin, **vreau** să adaug mai mulți oameni de contact la un partener, **pentru că** comunicăm
  cu persoane diferite (contabil, director, gestionar).
- **Ca** sistem, **vreau** să stochez IBAN validat și IDNO/CIF per țară, **pentru că** emiterea
  e-Factura Moldova cere IDNO-ul furnizorului.

## Acceptance criteria

- [ ] `server/db/schema/finParties.ts` cu tabelele:
  - `fin_parties`: id, tenantId, kind (`client` | `supplier` | `both`), name, country (char 2),
    idno (IDNO/CIF — varchar 13, nullable), vatCode (nullable), iban (nullable), address (nullable),
    city (nullable), postalCode (nullable), email (nullable), phone (nullable),
    isActive (bool default true), notes (nullable), createdAt, updatedAt
  - `fin_party_contacts`: id, partyId (FK → fin_parties.id onDelete cascade), name, role (nullable),
    email (nullable), phone (nullable), isPrimary (bool default false), createdAt, updatedAt
  - Indexuri: `fin_parties_tenant_idx` (tenantId), `fin_parties_kind_idx` (tenantId, kind)
- [ ] `server/db/schema/index.ts` exportă `export * from "./finParties"` (schema index rule)
- [ ] Migrare `drizzle/0115_fin_parties.sql` cu statement-breakpoints corecte
- [ ] `drizzle/meta/_journal.json` actualizat cu intrarea 0115
- [ ] Seed în `scripts/seed.ts`: 3 parteneri demo (1 client MD, 1 supplier RO, 1 both) cu câte
  1 contact fiecare; doar dacă `fin_parties` e gol (idempotent)
- [ ] `npm run db:reset && npm run db:seed` reușesc

## Files

**New:**
- `server/db/schema/finParties.ts` — schema fin_parties + fin_party_contacts
- `drizzle/0115_fin_parties.sql` — migrare manuală
- `drizzle/meta/0004_snapshot.json` — snapshot după migrare (sau numărul următor)
- `src/__tests__/fin/party-001-schema.test.ts` — teste unit pe schema

**Modified:**
- `server/db/schema/index.ts` — adaugă `export * from "./finParties"`
- `scripts/seed.ts` — seed 3 parteneri demo + contacte
- `drizzle/meta/_journal.json` — adaugă intrarea migrării 0115

## Tests

- **T-PARTY-001-1** [blocant] `finParties` și `finPartyContacts` exportate din `server/db/schema/index.ts`
- **T-PARTY-001-2** [blocant] `fin_parties.kind` enum acceptă valori `client`, `supplier`, `both`
- **T-PARTY-001-3** [blocant] `fin_party_contacts` are câmpul `partyId` cu relație FK definită
- **T-PARTY-001-4** [blocant] Fișierul `drizzle/0115_fin_parties.sql` există și conține `CREATE TABLE fin_parties`
- **T-PARTY-001-5** [normal] `fin_parties` are câmpul `idno` maxLength 13
- **T-PARTY-001-6** [normal] `finPartyContacts` are câmpul `isPrimary` cu default false

## DoD

- Schema compilează strict TypeScript (strict: true, zero any)
- Migrare 0115 corectă cu statement-breakpoints
- `server/db/schema/index.ts` conține exportul finParties
- check-undefined-refs + check-route-mounts verzi
- Toate testele T1-T6 verzi
