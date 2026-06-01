---
id: INT-901
title: "Integrări: API keys — generare, listare, revocare (auth externă)"
milestone: INT
phase: "1"
status: pending
depends_on: []
slug: api-keys
---

## Goal

Permite tenanților să genereze API keys pentru integrări externe (Zapier, Make, webhook
receivers). Un API key permite autentificarea pe aceleași endpoint-uri ca un JWT, dar fără
sesiune browser — folosit de sisteme terțe.

## In scope

- Schema `api_keys`: `id, tenant_id(FK), name, key_hash(bcrypt), prefix(8 chars, public), 
  created_at, last_used_at, revoked_at`.
- `POST /api/settings/api-keys` — generează key (returnează KEY o singură dată, nestocat în clar).
- `GET /api/settings/api-keys` — listează keys (prefix + name + last_used_at; NU key-ul în clar).
- `DELETE /api/settings/api-keys/:id` — revocă (setează `revoked_at`).
- Middleware `requireApiKey` (alternativă la requireAuth): verifică header `X-API-Key`, lookup
  pe prefix, bcrypt compare, tenant resolution. Tenant isolation: key aparține unui singur tenant.
- Pagina `/app/settings/api-keys` — tabel cu prefix, name, last_used, Revocă; buton „Generează".
- Migration `<N>_int901_api_keys.sql`.

## Out of scope

- Rate limiting per key (viitor).
- Scope/permission granulare pe key (viitor — acum: full-access ca admin).
- Outbound webhooks (INT-902).

## User stories

- **US-1**: Ca owner/admin, vreau să generez un API key pentru a conecta Zapier la Vector Learn.
- **US-2**: Ca owner/admin, vreau să văd ce keys există și să revoc oricare fără downtime.
- **US-3**: Ca sistem terț, vreau să mă autentific cu `X-API-Key: <key>` pe aceleași endpoint-uri.

## Acceptance criteria

- [ ] AC1: `POST /api/settings/api-keys` cu `{ name }` → 201, `{ key, prefix, id }` (key în clar o dată).
- [ ] AC2: `GET /api/settings/api-keys` → array cu prefix+name+dates, fără key în clar.
- [ ] AC3: `DELETE /api/settings/api-keys/:id` → 200, key revocat (last_used rămâne).
- [ ] AC4: Cerere cu header `X-API-Key: <key>` pe `GET /api/students` → 200 cu datele tenant-ului corect.
- [ ] AC5: Key revocat → 401; key invalid → 401; cross-tenant key → 403.
- [ ] AC6: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Files

### New
- `server/db/schema/apiKeys.ts`
- `server/routes/apiKeys.ts`
- `server/middleware/requireApiKey.ts`
- `src/pages/app/settings/ApiKeysPage.tsx`
- `drizzle/<N>_int901_api_keys.sql`
- `src/__tests__/integ/api-keys.test.ts`

### Modified
- `server/db/schema/index.ts`
- `server/index.ts` (mount route + middleware)
- `src/App.tsx` (route `/app/settings/api-keys`)
- `src/components/app/AppShell.tsx` (nav link Settings)

## Tests

- **T-INT-901-1** `[blocant]` Migration gate: `db:generate` nu lasă fișiere uncommitted; `db:reset && db:seed` trec.
- **T-INT-901-2** `[blocant]` POST generate → 201, key non-null, prefix 8 chars.
- **T-INT-901-3** `[blocant]` GET list → key-ul nu apare în clar.
- **T-INT-901-4** `[blocant]` DELETE revoke → re-use key → 401.
- **T-INT-901-5** `[blocant]` X-API-Key pe GET /api/students → 200 cu datele tenantului.
- **T-INT-901-6** Key invalid (random string) → 401.

## Definition of Done

- [ ] AC1-6; T-INT-901-1..6 verzi; build+typecheck+lint+test verzi
- [ ] Migration + API smoke + portability verzi (§3.5.1)
- [ ] integration-architect: CONNECTED (key → tenant auth chain)
