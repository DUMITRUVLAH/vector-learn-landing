---
id: REGISTRY-002
title: "API cote fiscale — GET versionate + helper rateAt extensii"
milestone: FIN
phase: "REGISTRY"
status: pending
attempts: 0
depends_on: [REGISTRY-001]
spec: backlog/specs/REGISTRY-002.md
branch: feat/FIN-registry
---

## Goal

Expune prin REST API cotele fiscale (`fin_tax_rates`) și planul de conturi (`fin_chart_of_accounts`) cu:
1. `GET /api/fin/registry/tax-rates` — lista cotelor versionate, filtrate după `?country=MD&kind=vat&date=2026-01-01`
2. `GET /api/fin/registry/tax-rates/:id` — o singură cotă
3. `POST /api/fin/registry/tax-rates` — adaugă cotă (admin/owner)
4. `GET /api/fin/registry/chart-of-accounts` — lista conturilor, filtrare după `?country=&tenantId=`
5. Helper `rateAt()` extins să suporte și apeluri fără `tenantId` (lookup global-only).

Scopul: modulele FISC, PAY, SPEND vor apela `rateAt()` intern; UI-ul de admin va consuma API-ul.

## User stories

- **Ca** contabil, **vreau** să interoghez cotele valabile la o dată anume, **pentru că** facturile istorice trebuie recalculate cu cota momentului emiterii.
- **Ca** admin, **vreau** să adaug o cotă nouă (ex: TVA redusă nouă), **pentru că** legislația se schimbă.
- **Ca** sistem (modul FISC), **vreau** să apelez `rateAt(tenantId, "MD", "vat", invoiceDate)` și să primesc numărul direct, **pentru că** nu vreau să rescriu logica de lookup în fiecare modul.

## Acceptance criteria

- [ ] Router `server/routes/finRegistry.ts` exportă `finRegistryRoutes` (Hono router)
- [ ] `GET /api/fin/registry/tax-rates` — returnează JSON array; suportă query params `country`, `kind`, `date` (filtrare server-side)
- [ ] `GET /api/fin/registry/tax-rates/:id` — returnează obiect sau 404
- [ ] `POST /api/fin/registry/tax-rates` — body validat cu zod; întoarce 201 + noua cotă; role guard: doar `owner` sau `admin` (via `requireRole`)
- [ ] `GET /api/fin/registry/chart-of-accounts` — returnează JSON array; suportă `country` + `tenantId` (optional)
- [ ] `finRegistryRoutes` montat în `server/app.ts` cu prefix `/api/fin/registry`
- [ ] `rateAt()` în `server/lib/finRegistry.ts` returnează corect când `tenantId` este `undefined`/`null` (global lookup)
- [ ] `check-route-mounts.mjs` rămâne verde (router montat)
- [ ] `check-undefined-refs.mjs` rămâne verde
- [ ] Unit tests trec (≥ 80% coverage pe fișierele noi)

## Files

**New:**
- `server/routes/finRegistry.ts` — Hono router cu 4 endpoints
- `src/__tests__/fin/registry-002-api.test.ts` — unit tests cu PGlite mock

**Modified:**
- `server/lib/finRegistry.ts` — extinde `rateAt()` să suporte `tenantId?: string | null`
- `server/app.ts` — montează `finRegistryRoutes`

## Tests

- **T-REGISTRY-002-1** [blocant] `GET /api/fin/registry/tax-rates?country=MD&kind=vat` returnează array cu cel puțin 4 rate MD
- **T-REGISTRY-002-2** [blocant] `GET /api/fin/registry/tax-rates?date=2025-01-01` returnează numai cotele active la acea dată
- **T-REGISTRY-002-3** [blocant] `POST /api/fin/registry/tax-rates` fără auth returnează 401
- **T-REGISTRY-002-4** [blocant] `GET /api/fin/registry/tax-rates/nonexistent-uuid` returnează 404
- **T-REGISTRY-002-5** [blocant] Router montat: `check-route-mounts.mjs` iese cu exit code 0
- **T-REGISTRY-002-6** [normal] `rateAt(undefined, "MD", "vat", new Date())` returnează 20 (fallback la global)
- **T-REGISTRY-002-7** [normal] `GET /api/fin/registry/chart-of-accounts?country=RO` returnează plan de conturi RO

## DoD

- Router montat, endpoints testați, check-route-mounts verde
- rateAt() suportă tenantId optional
- Unit tests ≥ 80% coverage pe fișierele noi
- Reviewer APPROVED; integration-architect CONNECTED
- Persona reports salvate
- Branch: feat/FIN-registry (același ca REGISTRY-001, aceeași PR #154)
