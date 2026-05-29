# Vector Learn

> CRM full-stack pentru centre educaționale — landing + backend funcțional cu auth, multi-tenant, Postgres.

## Quick start

```bash
git clone https://github.com/DUMITRUVLAH/vector-learn-landing.git
cd vector-learn-landing
npm install
npm run db:migrate        # Aplică schema în PGlite (no Docker needed)
npm run db:seed           # Tenant demo + 20 elevi + 5 lecții
npm run stack:dev         # Pornește API (:3000) + Web (:5173)
```

**Pentru a testa app-ul SaaS:**

```bash
# Setup parolă demo o singură dată:
curl -X POST http://localhost:3000/api/auth/__dev__/setup-demo-password
```

Apoi:
- http://localhost:5173/ — landing-ul (10 module + 4 audience + 3 calculatoare)
- http://localhost:5173/#/app/login — login (`admin@demo.vectorlearn.io` / `demo123456`)
- http://localhost:5173/#/app/students — 20 elevi seed-uiți
- http://localhost:5173/#/app/schedule — 5 lecții seed-uite
- http://localhost:5173/#/app/teachers — 3 profesori
- http://localhost:5173/#/app/payments — gol, adaugă plata ta

## Arhitectură

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│    │                                                         │
│    ▼                                                         │
│  Frontend (Vite + React + Tailwind, port 5173 in dev)       │
│    │                                                         │
│    │ /api/*  (Vite proxy in dev, same-origin in prod)       │
│    ▼                                                         │
│  Backend (Hono on Node, port 3000)                          │
│    ├─ /api/auth/{signup,login,logout,me}                    │
│    ├─ /api/students  (CRUD)                                 │
│    ├─ /api/teachers  (list with user join)                  │
│    ├─ /api/courses   (CRUD)                                 │
│    ├─ /api/lessons   (CRUD + conflict detection)            │
│    ├─ /api/payments  (CRUD + stats)                         │
│    └─ /api/health, /api/health/db                           │
│    │                                                         │
│    ▼                                                         │
│  Drizzle ORM                                                 │
│    │                                                         │
│    ▼                                                         │
│  PGlite (Postgres in WASM, dev/MVP)                         │
│    OR                                                        │
│  Postgres (Neon/Supabase in prod, see DEPLOY.md)            │
└─────────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Tech | De ce |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript strict + Tailwind | rapid, type-safe, design system Vector 365 |
| Backend | Hono on Node 22 | cel mai rapid micro-framework, edge-ready |
| ORM | Drizzle | type-safe SQL, no runtime overhead |
| DB | PGlite (dev) / Postgres (prod) | real Postgres în WASM, zero Docker pentru dev |
| Auth | bcrypt + token sessions in DB | simplu, fără dep externe |
| Tests | Vitest + Testing Library | 220 teste verzi |

## Schema (9 tabele)

- `tenants` — un centru educațional
- `users` — staff (admin/manager/teacher/...) per tenant
- `sessions` — token-based auth sessions
- `students` — elevii înrolați
- `teachers` — link users(role=teacher) cu rate + commission
- `courses` — disciplinele oferite
- `lessons` — instanțe programate, cu detectare conflict
- `student_lessons` — m2m attendance
- `payments` — facturi cu status (pending/paid/overdue/refunded/cancelled)

Toate au `tenant_id` (row-level multi-tenancy).

## Structura repo

```
├── src/                     # React frontend
│   ├── components/          # UI primitives + landing sections
│   ├── pages/
│   │   ├── modules/         # 10 landing module pages
│   │   ├── audiences/       # 4 landing per-segment pages
│   │   ├── tools/           # 3 calculatoare
│   │   └── app/             # SaaS app pages (login, students, etc.)
│   ├── hooks/useSession.ts
│   ├── lib/api/*.ts         # typed API clients
│   └── router/HashRouter.tsx
├── server/                  # Hono backend
│   ├── index.ts             # entry + routes mount
│   ├── auth/                # bcrypt + sessions
│   ├── middleware/          # requireAuth
│   ├── routes/              # auth, students, teachers, courses, lessons, payments
│   └── db/
│       ├── client.ts        # PGlite + Drizzle
│       ├── schema/          # one file per table
│       ├── migrate.ts       # runner
│       └── seed.ts          # demo tenant
├── drizzle/                 # auto-generated migrations
├── backlog/                 # specs + state for autopilot
├── docker-compose.yml       # single-container production
├── Dockerfile               # multi-stage build
└── DEPLOY.md                # 3 deployment options
```

## Scripts

| Script | Ce face |
|---|---|
| `npm run stack:dev` | API + Frontend cu auto-reload (cel mai des folosit) |
| `npm run dev` | Doar frontend Vite |
| `npm run server:dev` | Doar backend Hono cu watch |
| `npm run db:migrate` | Aplică migrațiile |
| `npm run db:seed` | Populează tenant demo |
| `npm run db:reset` | Nuke .pglite + re-migrate |
| `npm run db:generate` | Diff schema → nou SQL migration |
| `npm run typecheck` | TS check |
| `npm run test:run` | Vitest |
| `npm run build` | Production bundle frontend |
| `npm run start` | Run prod server (migrate + serve) |
| `npm run docker:up` | Build + start container (prod) |

## Deploy

Vezi [DEPLOY.md](DEPLOY.md) pentru 3 opțiuni:

1. **Docker single container** — VPS, $5/lună
2. **Vercel + Railway** — scale fără ops
3. **Vercel + Neon Postgres** — enterprise

## Roadmap

| Milestone | Status |
|---|---|
| M1 Landing — 10 module pages | ✅ Done |
| M2 Audience landing — 4 segmente | ✅ Done |
| M3 Calculators — ROI, Migrare, Pricing | ✅ Done |
| MVP-001 Backend skeleton | ✅ Done |
| MVP-002 Schema (9 tables) + seed | ✅ Done |
| MVP-003 Auth (signup/login/sessions) | ✅ Done |
| MVP-004 Students CRUD | ✅ Done |
| MVP-005 Lessons + Schedule | ✅ Done |
| MVP-006 Teachers UI | ✅ Done |
| MVP-007 Payments | ✅ Done |
| MVP-008 Deploy (Docker + guide) | ✅ Done |
| MVP-009 Stripe real | ☐ Next |
| MVP-010 WhatsApp Business API | ☐ Next |
| MVP-011 Real Postgres migration helper | ☐ Next |
| MVP-012 Mobile app (Expo) | ☐ Future |

## License

Proprietary — Vector Learn SRL.
