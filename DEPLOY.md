# Vector Learn — Deployment Guide

> MVP-008. Trei opțiuni de deploy, de la cea mai simplă la cea mai scalabilă.

---

## Opțiunea 1: Docker (cel mai simplu — single container)

**Recomandat pentru**: prima lansare, dev-staging, single-tenant pe VPS.

### Prerequisites
- Docker + Docker Compose instalate pe server (Hetzner, DigitalOcean, OVH, etc.)
- Domeniu pointed la IP-ul serverului (opțional, sau folosești :3000 direct)

### Pași

```bash
# 1. Clone repo pe server
git clone https://github.com/DUMITRUVLAH/vector-learn-landing.git
cd vector-learn-landing

# 2. Setează env vars production
cat > .env << EOF
AUTH_SECRET=$(openssl rand -base64 48)
ALLOWED_ORIGINS=https://app.exemplul-tau.ro
NODE_ENV=production
EOF

# 3. Build & start (frontend + backend într-un singur container)
docker compose up -d --build

# 4. Verifică
curl http://localhost:3000/api/health
# {"ok":true,"db":"connected","time":"..."}

# 5. Setup demo password (one-time)
curl -X POST http://localhost:3000/api/auth/__dev__/setup-demo-password
# Apoi login cu admin@demo.vectorlearn.io / demo123456
```

### Reverse proxy (nginx / Caddy)

**Caddy** (cel mai simplu — HTTPS auto cu Let's Encrypt):

```caddyfile
app.exemplul-tau.ro {
  reverse_proxy localhost:3000
}
```

```bash
caddy reload
# Done. Cookies httpOnly + Secure funcționează acum pe HTTPS.
```

### Backup PGlite

PGlite stochează date în `/app/.pglite` (montat ca volume Docker).

```bash
# Snapshot zilnic
docker exec vector_learn_app tar czf /tmp/db-backup.tar.gz /app/.pglite
docker cp vector_learn_app:/tmp/db-backup.tar.gz ./backups/db-$(date +%F).tar.gz

# Restore
docker compose down
docker volume rm vector-learn-landing_vector_learn_data
docker volume create vector-learn-landing_vector_learn_data
docker run --rm -v vector-learn-landing_vector_learn_data:/target \
  -v $(pwd)/backups:/backup alpine \
  sh -c "cd /target && tar xzf /backup/db-2026-05-29.tar.gz --strip-components=2"
docker compose up -d
```

---

## Opțiunea 2: Vercel (frontend) + Railway (backend)

**Recomandat pentru**: scalare, multi-region, zero-ops.

### Frontend pe Vercel

```bash
# Doar SPA-ul
npm install -g vercel
vercel --prod

# La prompt: framework = Vite, output = dist
# Apoi setează env var: VITE_API_URL=https://api.exemplul-tau.ro
```

### Backend pe Railway

1. Conectează GitHub repo la [railway.app](https://railway.app)
2. New Service → Deploy from GitHub
3. Detection automată Node, sau setează Dockerfile path
4. Env vars:
   - `DATABASE_PATH=/data/.pglite`
   - `AUTH_SECRET=<openssl rand -base64 48>`
   - `ALLOWED_ORIGINS=https://app.exemplul-tau.ro`
   - `PORT=3000`
5. Volume: mount `/data` pentru persistență PGlite
6. Deploy → URL public api.exemplul-tau.ro

### CNAME

```
app.exemplul-tau.ro → cname.vercel-dns.com
api.exemplul-tau.ro → <railway-cname>
```

---

## Opțiunea 3: Postgres real (Neon / Supabase)

**Recomandat pentru**: > 1000 elevi/tenant, multi-region, scale serios.

PGlite e perfect pentru MVP / single-tenant până la ~1k tenants. Peste, treci la Postgres real.

### Switch de la PGlite la Postgres

**1. Adaugă driver-ul** (deja avem `postgres` în deps):

```typescript
// server/db/client.ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const queryClient = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(queryClient, { schema });
```

**2. Update drizzle.config.ts**:

```typescript
export default defineConfig({
  out: "./drizzle",
  schema: "./server/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**3. Setează `DATABASE_URL`** (Neon free tier dă 0.5 GB gratuit):

```bash
DATABASE_URL=postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/vector_learn
```

**4. Rulează migrațiile** pe noul DB:

```bash
npm run db:migrate
npm run db:seed
```

Schema e identică (același Drizzle), datele rămân cu același shape.

---

## Env vars (toate environment-urile)

| Var | Required | Default | Notes |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP port |
| `NODE_ENV` | no | `development` | `production` activează static serving |
| `DATABASE_PATH` | no | `./.pglite` | PGlite folder (only with PGlite) |
| `DATABASE_URL` | no | — | Set this to switch to real Postgres |
| `AUTH_SECRET` | yes (prod) | — | min 32 chars; `openssl rand -base64 48` |
| `ALLOWED_ORIGINS` | yes (prod) | — | comma-separated, e.g. `https://app.x.ro,https://www.x.ro` |
| `VITE_API_URL` | no | proxy via Vite dev | only needed when frontend deployed separately |

---

## Health checks

- `GET /api/health` → `{ok:true, db:"connected"}`
- `GET /api/health/db` → counts per table

Use these in your load balancer / k8s readiness probe.

---

## Scaling considerations

| Stage | Setup | Cost / lună |
|---|---|---|
| MVP, < 50 tenants | Single Docker on $5 VPS + PGlite | ~$5 |
| Growth, < 1k tenants | Docker on $20 VPS + PGlite + Caddy | ~$20 |
| Scale, > 1k tenants | Vercel + Railway + Neon Postgres | ~$50–200 |
| Enterprise | k8s + managed Postgres + read replicas | $500+ |

---

## Production checklist

- [ ] `AUTH_SECRET` is 32+ random chars (not the default)
- [ ] `ALLOWED_ORIGINS` excludes localhost
- [ ] HTTPS via reverse proxy (Caddy/nginx/Vercel)
- [ ] Backup script for PGlite folder (or Neon PITR)
- [ ] `__dev__/setup-demo-password` endpoint disabled (it returns 403 when NODE_ENV=production)
- [ ] Monitoring on `/api/health` (UptimeRobot is free)
- [ ] Logs piped to a real service (Axiom, Better Stack, or just `docker logs`)
- [ ] Rate limit on auth routes (TODO — add `hono-rate-limiter` middleware)
