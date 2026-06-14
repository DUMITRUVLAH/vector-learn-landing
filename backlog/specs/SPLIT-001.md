---
id: SPLIT-001
title: tenants.app_kind (learn|business) — migrare ADD COLUMN + backfill + seed tenant business demo
milestone: SPLIT
phase: "1"
branch: feat/SPLIT-foundation
status: pending
depends_on: []
---

## Goal
Adaugă coloana `app_kind` (tip `varchar(20)`, default `'learn'`) pe tabela `tenants`.
Backfill: toți tenanții existenți primesc `app_kind = 'learn'`.
Seed: creează un tenant demo `business` (slug `demo-business-suite`) cu un user admin `admin@demo.business.io`.
Aceasta e fundația separării celor două aplicații.

## User stories
- Ca owner de produs, vreau să știu că fiecare tenant aparține aplicației CRM sau Business Suite, pentru că altfel nu pot controla accesul încrucișat.
- Ca admin Business Suite, vreau să mă pot loga pe demo cu credențiale separate, pentru că demo-ul CRM nu trebuie să aibă acces la FinDesk/PAR.
- Ca developer, vreau ca migrarea să fie sigură (`ADD COLUMN IF NOT EXISTS`), pentru că rulează pe Supabase Prod care are deja date.

## Acceptance criteria
- [ ] Schema `server/db/schema/tenants.ts` are câmpul `appKind: varchar("app_kind", { length: 20 }).notNull().default("learn")`.
- [ ] Migrarea `drizzle/0144_split_app_kind.sql` există: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS app_kind VARCHAR(20) NOT NULL DEFAULT 'learn'`.
- [ ] `meta/_journal.json` are entry cu `idx: 144, tag: "0144_split_app_kind"`.
- [ ] `server/db/seed.ts` creează tenant `demo-business-suite` cu `app_kind = 'business'` și user `admin@demo.business.io / demo123456`.
- [ ] `db:reset && db:seed` trece fără erori.
- [ ] Tenanții existenți (inclusiv `demo-lingua-school`) rămân cu `app_kind = 'learn'` (default aplicat automat de migrare).

## Files
- `server/db/schema/tenants.ts` — adaugă `appKind`
- `drizzle/0144_split_app_kind.sql` — migrare ADD COLUMN IF NOT EXISTS
- `drizzle/meta/0144_snapshot.json` — snapshot (minim, poate fi copiat + incrementat din 0143)
- `drizzle/meta/_journal.json` — append entry idx 144
- `server/db/seed.ts` — seed tenant business demo

## Tests
- **T-SPLIT-001-1** [blocant] Given migrarea 0144 aplicată, When SELECT app_kind FROM tenants WHERE slug='demo-lingua-school', Then rezultat = 'learn'
- **T-SPLIT-001-2** [blocant] Given seed rulat, When SELECT app_kind FROM tenants WHERE slug='demo-business-suite', Then rezultat = 'business'
- **T-SPLIT-001-3** [blocant] Given db:reset && db:seed, When npm run db:seed, Then exit code 0, fără erori
- **T-SPLIT-001-4** [normal] Given schema actualizat, When TypeScript compile, Then tipul Tenant include câmpul appKind: string

## DoD
- Schema + migrare + journal actualizate
- Seed creează tenant business demo
- `db:reset && db:seed` verde
- Build + typecheck verde
