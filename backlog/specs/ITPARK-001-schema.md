---
id: ITPARK-001
title: "ITPARK schema (itpark.ts) + enums + migrare (prefix > max origin/main) + index export + seed dosar demo"
milestone: ITPARK
phase: "A"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/ITPARK-001-schema.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal

Modelul de date complet pentru modulul „Moldova IT Park Audit Toolkit", refolosind stack-ul existent
(Drizzle + PGlite/Supabase, multi-tenant). Un singur fișier `server/db/schema/itpark.ts` cu toate
tabelele din ITPARK-CORE §2, enum-urile, o migrare committed cu prefix **> max pe `origin/main` în
momentul build-ului** (azi `0115_efactura_moldova`, deci ITPARK ia `0116` — dar dacă main avansează
înainte de build, se renumerotează; nu se hardcodează `0116` în advance), export în `schema/index.ts`
și seed pentru un dosar demo (Vector Academy 2025, fixture de aur). Fundația tuturor item-urilor ITPARK.

> **Notă critică despre prefix:** atât FIN-BACKLOG cât și ITPARK revendică prefix `0116`. ITPARK
> este prioritar — se construiește PRIMUL. Dacă FIN este construit pe același branch sau concurent,
> FIN ia prefix-ul următor după ITPARK. Regula: nu comite niciodată două migrări cu același prefix.

## User stories

- **Ca** dezvoltator, **vreau** un model care acoperă fidel Anexa 2/3/4 + scrisorile, **pentru că**
  restul modulului se construiește peste el fără rework.
- **Ca** contabil, **vreau** ca fiecare dosar să fie izolat pe tenant, **pentru că** datele fiscale ale
  firmelor nu trebuie să se vadă între conturi.
- **Ca** dezvoltator, **vreau** un seed cu dosarul Vector Academy, **pentru că** pot valida imediat că
  motorul reproduce cifrele reale (1.971.197,19 / 88,48%).

## Acceptance criteria

- [ ] `server/db/schema/itpark.ts` definește: `itparkEngagements`, `itparkRevenueLines`,
  `itparkCaemCodes`, `itparkMonthly`, `itparkPacketDocuments`, `itparkSettings`, `itparkAudit` (CORE §2)
- [ ] Enum-uri: `itpark_engagement_status` (draft|in_progress|ready|exported),
  `itpark_packet_kind` (anexa2|anexa3|anexa4|letter_solvency|letter_address|letter_no_subdivisions|letter_activity|letter_no_adjustments|decl_self_responsibility),
  `itpark_doc_status` (draft|ready|exported)
  (Nota: `itpark_role` enum NU se mai creează; accesul se derivă din `userRoleEnum` existent
  + `itpark_settings.auditorUserId` — decisie ITPARK-003, eliminată din schema fondației)
- [ ] `itparkSettings` include câmpul `auditorUserId uuid references users(id)` (nullable) conform CORE §2 actualizat
- [ ] Toate tabelele: `id uuid pk`, `tenantId → tenants` (cascade), `createdAt`, `updatedAt`; bani în
  `*_cents` (bigint) + `currency` default `MDL`; procente în `numeric(5,2)`
- [ ] Index-uri pe `tenant_id` + pe FK des-interogate (`engagement_id`, `caem_code`, `month`)
- [ ] `server/db/schema/index.ts` conține `export * from "./itpark";` (același commit — §3.5.1)
- [ ] `drizzle/<N>_itpark_core.sql` committed (prefix `<N>` = max pe `origin/main` + 1 în momentul
  build-ului; astăzi `0116` dacă `0115_efactura_moldova` e pe main; se renumerotează dacă main
  avansează); `db:generate` lasă 0 fișiere uncommitted; prefix > max real pe `origin/main`
- [ ] `--> statement-breakpoint` între statement-uri (§3.5.1)
- [ ] Seed (`server/db/seed.ts` extins, idempotent, guarded): dosar demo „Vector Academy SRL" 2025
  (IDNO 1024600035737, contract MITP nr.2368 din 18.07.2024, perioadă 01.01–31.12.2025) cu un subset
  reprezentativ de linii de venit (≥10, inclusiv una `62.02` și restul `85.59`) + `itpark_settings`
  (prag 70, toleranță 2, MDL)
- [ ] `db:reset && db:seed` trec fără eroare

## Files

**New:**
- `server/db/schema/itpark.ts`
- `drizzle/<N>_itpark_core.sql` (prefix N = max origin/main + 1 în momentul build-ului) + `drizzle/meta/<N>_snapshot.json`, `_journal.json` idx N

**Modified:**
- `server/db/schema/index.ts` — `export * from "./itpark";`
- `server/db/seed.ts` — seed dosar demo (idempotent, guarded)

## Tests
- **T-001-1** [blocant] `db:generate` → 0 fișiere uncommitted; prefixul migrării > max idx din `drizzle/meta/_journal.json` pe `origin/main` (nu duplicat cu nicio migrare existentă)
- **T-001-2** [blocant] `db:reset && db:seed` trec; tabelele itpark există
- **T-001-3** [blocant] `schema/index.ts` conține `export * from "./itpark"`
- **T-001-4** [blocant] `src/__tests__/schema-drift.test.ts` rămâne verde

## DoD
- Migration gate verde (0 uncommitted; db:reset+seed OK; prefix>main; breakpoints OK)
- schema-drift + check-refs verzi
- Reviewer APPROVED; integration-architect fără COMPETING_SYSTEM (reutilizează tenants/users)
- Persona reports salvate
