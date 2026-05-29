---
id: MVP-001
title: Backend skeleton (Hono + Postgres + Drizzle)
milestone: MVP
estimate_hours: 2
priority: P0
---

# MVP-001 — Backend skeleton

## Goal
Pune fundația pentru un backend real: server Hono, conexiune Postgres locală via Docker, Drizzle ORM, prima migrație, endpoint `/api/health`. Frontend-ul existent se conectează la backend prin Vite proxy.

## Acceptance criteria
- [ ] `docker-compose.yml` pornește Postgres 16 local pe port 5432
- [ ] `server/` cu Hono + tsx + endpoint `/api/health` returnează `{ ok: true, db: "connected" }`
- [ ] Drizzle config + folder `drizzle/` cu primul migration (tabel `health_check`)
- [ ] `npm run db:up` (docker), `npm run db:migrate`, `npm run server:dev` funcționează
- [ ] Vite dev server proxy-uiește `/api/*` la `http://localhost:3000`
- [ ] Frontend afișează un mic indicator de "Backend status: connected" în footer (doar în dev mode)

## Files
- `docker-compose.yml`
- `server/index.ts` (Hono entry)
- `server/db/client.ts` (Drizzle + pg)
- `server/db/schema.ts` (first table)
- `drizzle.config.ts`
- `drizzle/0000_initial.sql` (generated)
- `vite.config.ts` (proxy)
- `package.json` (new deps + scripts)
- `README.md` update

## DoD
Toate gates trec + backend răspunde pe `curl http://localhost:5173/api/health`.
