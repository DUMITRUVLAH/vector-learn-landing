---
id: SPLIT-201
title: "PARTY comun: par_vendors ↔ fin_parties + ITPark engagements ↔ fin_parties (bridge columns)"
milestone: SPLIT
phase: "3"
depends_on: ["SPLIT-103"]
spec: "backlog/specs/SPLIT-201.md"
status: pending
attempts: 0
blockers: []
---

# SPLIT-201 — PARTY comun: mapare par_vendors ↔ fin_parties și ITPark ↔ fin_parties

## Goal
Adaugă coloane de legătură (bridge) pe tabelele `par_vendors` și `itpark_engagements` pentru a le lega la `fin_parties` — sursa unică de adevăr pentru parteneri/clienți în Business Suite. Un furnizor PAR sau un rezident ITPark este același contact în FinDesk. **Reuse, nu rebuild.**

## Reguli critice (§3.5.1quater)
- `ADD COLUMN IF NOT EXISTS` — niciodată re-CREATE tabele existente.
- FK-uri declarate în bloc `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` (guard idempotent).
- Migrare prefix `0146_split_party_bridge` (> max 145 din main).
- Statement-breakpoints (`--> statement-breakpoint`) între fiecare instrucțiune SQL.

## User stories
- Ca CFO, vreau să văd că furnizorul dintr-un PAR este același contact ca în FinDesk, pentru că nu vreau să întrețin două liste de furnizori.
- Ca administrator, vreau ca un rezident ITPark să aibă automat un profil de partener FinDesk, pentru că facturile lui apar în ambele module.
- Ca utilizator Business Suite, vreau să selectez din aceeași bază de parteneri în PAR și FinDesk, pentru că duplicatele creează confuzie.
- Ca auditor, vreau să urmăresc traseul complet furnizor → PAR → cheltuială FinDesk, pentru că GDPR cere o sursă unică de adevăr.

## Acceptance criteria

### AC-1 Coloana bridge pe par_vendors
- `par_vendors.fin_party_id UUID NULL` adăugată prin migrare idempotentă.
- FK implicit (nu declarată cu `REFERENCES` în SQL direct) sau în `DO $$` guard — nu blochează existența rândurilor fără legătură.
- Schema Drizzle `par.ts` actualizată cu câmpul `finPartyId: uuid("fin_party_id")` (nullable, fără `.notNull()`).

### AC-2 Coloana bridge pe itpark_engagements
- `itpark_engagements.fin_party_id UUID NULL` adăugată prin migrare idempotentă.
- Schema Drizzle `itpark.ts` actualizată cu câmpul `finPartyId: uuid("fin_party_id")` (nullable).

### AC-3 Migrarea este validă
- Fișier `drizzle/0146_split_party_bridge.sql` — conține `ADD COLUMN IF NOT EXISTS` pentru ambele tabele.
- FK-uri în `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
- `--> statement-breakpoint` între fiecare instrucțiune.
- Intrat în `drizzle/meta/_journal.json` cu `idx: 146`.
- `npm run db:reset && npm run db:seed` trec fără erori.

### AC-4 API: link/unlink vendor ↔ party
- `PATCH /api/par/vendors/:id` acceptă `{ fin_party_id: string | null }` — setează sau șterge legătura.
- Răspuns: `{ id, fin_party_id, ... }` cu câmpul actualizat.
- Autorizare: `par_admin` sau `finance`.

### AC-5 API: link/unlink engagement ↔ party
- `PATCH /api/itpark/engagements/:id/party` acceptă `{ fin_party_id: string | null }`.
- Răspuns: `{ id, fin_party_id, ... }`.
- Autorizare: orice utilizator autentificat business cu acces la dosar.

### AC-6 UI: selector partener în PAR Vendor form
- Formularul de vendor PAR (`/business/par/vendors` sau în crearea PAR) afișează un câmp opțional „Partener FinDesk" — dropdown/search over `fin_parties` ale aceluiași tenant.
- Câmpul poate fi gol (vendor fără legătură FinDesk).

### AC-7 UI: indicator legătură în dosarul ITPark
- Pagina de detaliu dosar ITPark (`/business/itpark/engagements/:id`) afișează un câmp „Partener FinDesk" cu legătura curentă sau buton „Asociere partener".

## Files to touch
- `server/db/schema/par.ts` — add `finPartyId` field to `parVendors` table
- `server/db/schema/itpark.ts` — add `finPartyId` field to `itparkEngagements` table
- `drizzle/0146_split_party_bridge.sql` — migration (hand-written, idempotent)
- `drizzle/meta/_journal.json` — append entry idx 146
- `server/routes/par.ts` — add `PATCH /vendors/:id` for fin_party_id
- `server/routes/itpark.ts` (sau echivalent) — add `PATCH /engagements/:id/party`
- `src/pages/business/par/` — vendor form: add fin_party_id selector
- `src/pages/business/itpark/` — engagement detail: add party link indicator

## Tests
- **T-201-1** [blocant] Given migrarea 0146 aplicată, When `SELECT column_name FROM information_schema.columns WHERE table_name='par_vendors' AND column_name='fin_party_id'`, Then returnează un rând.
- **T-201-2** [blocant] Given migrarea 0146 aplicată, When `SELECT column_name FROM information_schema.columns WHERE table_name='itpark_engagements' AND column_name='fin_party_id'`, Then returnează un rând.
- **T-201-3** [blocant] Given `db:reset && db:seed`, When seed rulat, Then nu apar erori de schemă.
- **T-201-4** [blocant] Given user autentificat business cu rol `par_admin`, When `PATCH /api/par/vendors/:id` cu `{ fin_party_id: <uuid-valid> }`, Then 200 și răspuns conține `fin_party_id`.
- **T-201-5** [normal] Given vendor PAR fără legătură, When câmpul fin_party_id=null, Then PATCH cu null returnează 200 și șterge legătura.
- **T-201-6** [normal] Given pagina vendor PAR în UI, When utilizatorul caută un partener FinDesk, Then dropdown-ul afișează partenerii `fin_parties` ai tenantului.

## DoD
- [ ] Migrare 0146 commitată, fără coliziune prefix, `_journal.json` actualizat
- [ ] Schemele Drizzle actualizate cu câmpurile nullable
- [ ] API PATCH pentru ambele tabele implementat și testat
- [ ] UI: câmp selector în vendor PAR + indicator în dosarul ITPark
- [ ] `db:reset && db:seed` ✓
- [ ] Reviewer APPROVED, integration-architect CONNECTED
- [ ] Persona reports salvate
