---
id: CLIENTPORTAL-001
title: Portal client financiar — schema token + acces magic-link pentru clienți B2B
milestone: FIN
phase: "22"
status: pending
depends_on: [BILL-002, PARTY-001]
branch: feat/FIN-clientportal
spec_version: 1
---

## Goal

Permite clientului (companie/persoana fizică) să acceseze un portal read-only la propriile facturi,
plăți și documente fără cont în sistemul intern. Refolosește pattern-ul `studentPortalTokens`:
un token UUID unic trimis prin email/SMS, fără parolă. Clientul accesează
`/portal/client?token=<uuid>` și vede toate facturile sale, statusul plăților și poate descărca PDF.

## User stories

- Ca Andreea (director), vreau să trimit clientului B2B un link magic-link pentru facturile sale,
  pentru că acum imprimăm și trimitem fizic — durează 3 zile.
- Ca client B2B al academiei, vreau să văd toate facturile mele online fără cont, pentru că nu am
  timp să sune la academy după fiecare factură.
- Ca Cristina (mama unui student), vreau să văd soldul și chitanțele pe telefonul meu, pentru că
  pierd hârtiile.
- Ca admin financiar, vreau să generez și să trimit un token de portal pentru orice contact/companie,
  pentru că e mai sigur decât parole shared.

## Acceptance criteria

1. Schemă DB `fin_client_portal_tokens` (tabel nou), cu câmpuri:
   - `id` UUID PK
   - `tenant_id` UUID FK → tenants.id CASCADE
   - `contact_id` UUID FK nullable → contacts.id CASCADE (persoana fizică)
   - `company_id` UUID FK nullable → companyClients.id CASCADE (companie B2B)
   - `token` UUID UNIQUE NOT NULL (magic-link)
   - `expires_at` TIMESTAMP WITH TIME ZONE NOT NULL
   - `last_used_at` TIMESTAMP WITH TIME ZONE nullable
   - `is_active` BOOLEAN DEFAULT true
   - `created_by` UUID FK → users.id nullable
   - `created_at` TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   - Constraint CHECK: `contact_id IS NOT NULL OR company_id IS NOT NULL`
2. Migrare SQL handwritten (pattern existent) adăugată și commitată; `db:reset && db:seed` verzi.
3. Schema exportată din `server/db/schema/index.ts`.
4. `POST /api/fin/client-portal/tokens` — admin generează token (body: `{contactId?, companyId?, expiresInDays?}`); returnează `{token, expiresAt, portalUrl}`.
5. `DELETE /api/fin/client-portal/tokens/:id` — admin revocă token (setează `is_active = false`).
6. `GET /api/fin/client-portal/tokens` — admin listează tokeni activi ai tenantului.
7. `GET /api/fin/client-portal/me?token=<uuid>` — **public** (no auth middleware): validează token, returnează `{contactName, companyName, tenantName}` sau 401 dacă expirat/inactiv.
8. Router `finClientPortalRoutes` montat în `server/app.ts` la `/api/fin/client-portal`.
9. Teste vitest: T-CLIENTPORTAL-001-1..4.

## Files

### New
- `server/db/schema/finClientPortalTokens.ts` — schema Drizzle
- `server/db/migrations/<next_prefix>_fin_client_portal_tokens.sql` — migrare handwritten
- `server/routes/finClientPortal.ts` — router Hono cu 4 endpoint-uri
- `src/lib/api/finClientPortal.ts` — API client TS
- `src/__tests__/fin/clientportal-001.test.ts` — teste

### Modified
- `server/db/schema/index.ts` — adaugă export `finClientPortalTokens`
- `server/db/migrations/meta/_journal.json` — append entry nouă
- `server/app.ts` — mountează finClientPortalRoutes

## Tests

- **T-CLIENTPORTAL-001-1** [blocant] Given server pornit + user admin autentificat, When POST /api/fin/client-portal/tokens cu body `{contactId: "uuid-valid"}`, Then status 200 + JSON conține `token` (UUID) și `portalUrl` (string cu /portal/client?token=).
- **T-CLIENTPORTAL-001-2** [blocant] Given token activ creat, When GET /api/fin/client-portal/me?token=<valid-token> (fără auth), Then status 200 + JSON cu contactName sau companyName.
- **T-CLIENTPORTAL-001-3** [blocant] Given token inexistent, When GET /api/fin/client-portal/me?token=bad-uuid, Then status 401 + mesaj error.
- **T-CLIENTPORTAL-001-4** [blocant] Given schema finClientPortalTokens importată, When db.query.finClientPortalTokens, Then nu aruncă TypeError (schema exportată corect din index.ts).
- **T-CLIENTPORTAL-001-5** [normal] Given token activ, When DELETE /api/fin/client-portal/tokens/:id, Then status 200 + token marcat is_active=false + GET /me cu acel token → 401.

## DoD

- [ ] Tabel `fin_client_portal_tokens` în schema Drizzle + migrare SQL commitată
- [ ] `server/db/schema/index.ts` conține `export * from "./finClientPortalTokens"`
- [ ] 4 endpoint-uri montate în app.ts via `finClientPortalRoutes`
- [ ] `GET /me` public (fără requireAuth) validează token + returnează identitate
- [ ] Tokens expirate/inactive returnează 401
- [ ] Toate 5 teste vitest trec
- [ ] Build + typecheck + lint fără erori noi
- [ ] Static guards (route-mounts, schema-drift, migration-breakpoints, undefined-refs) verzi
- [ ] `db:reset && db:seed` trec după migrare
