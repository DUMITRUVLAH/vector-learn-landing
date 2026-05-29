# Vector Learn — Backlog (Autopilot)

> Single source of truth for the autonomous build pipeline.
>
> The orchestrator reads this file. Each item points to a detailed spec in `backlog/specs/`.
> Status values: `pending` → `in_progress` → `review` → `done` → `blocked`.
>
> **NEVER edit by hand while autopilot is running.** Use the orchestrator agent.

---

## Active milestone: M1 — Module deep-dive pages

Each module gets a dedicated landing sub-page at `/modules/<slug>` with an interactive demo, deep-dive copy, screenshots, FAQ, and a CTA. Output is a fully built page + tests + UX persona reviews + lighthouse score ≥ 90.

| # | ID | Title | Status | Owner | Spec |
|---|----|-------|--------|-------|------|
| 1 | `M1-001` | Orar interactiv — module page | done ✅ | orchestrator | [specs/M1-001-orar.md](specs/M1-001-orar.md) · [PR #1](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/1) |
| 2 | `M1-002` | Finanțe — module page | done ✅ | orchestrator | [specs/M1-002-finante.md](specs/M1-002-finante.md) · [PR #2](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/2) |
| 3 | `M1-003` | CRM și vânzări — module page | done ✅ | orchestrator | [specs/M1-003-crm.md](specs/M1-003-crm.md) · [PR #3](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/3) |
| 4 | `M1-004` | Comunicare multi-canal — module page | done ✅ | orchestrator | [specs/M1-004-comunicare.md](specs/M1-004-comunicare.md) · [PR #4](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/4) |
| 5 | `M1-005` | Aplicație mobilă — module page | done ✅ | orchestrator | [specs/M1-005-mobile.md](specs/M1-005-mobile.md) · [PR #5](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/5) |
| 6 | `M1-006` | Rapoarte și analize — module page | done ✅ | orchestrator | [specs/M1-006-rapoarte.md](specs/M1-006-rapoarte.md) · [PR #6](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/6) |
| 7 | `M1-007` | HR și echipă — module page | done ✅ | orchestrator | [specs/M1-007-hr.md](specs/M1-007-hr.md) · [PR #7](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/7) |
| 8 | `M1-008` | Multi-filiale și franciză — module page | done ✅ | orchestrator | [specs/M1-008-multifilale.md](specs/M1-008-multifilale.md) · [PR #8](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/8) |
| 9 | `M1-009` | Integrări 350+ — module page | done ✅ | orchestrator | [specs/M1-009-integrari.md](specs/M1-009-integrari.md) · [PR #9](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/9) |
| 10 | `M1-010` | AI Assistant — module page | done ✅ | orchestrator | [specs/M1-010-ai.md](specs/M1-010-ai.md) · [PR #10](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/10) |

**🎉 M1 milestone: 10/10 done. All PRs open for review.**

## Active milestone: M2 — Audience landing pages

Pages tailored per persona at `/pentru/<slug>`. Each reuses shared shells from M2-001 and shows segment-specific pain → solution mapping back to M1 module pages.

| # | ID | Title | Status | Owner | Spec |
|---|----|-------|--------|-------|------|
| 1 | `M2-001` | Pentru centre de limbi străine | done ✅ | orchestrator | [specs/M2-001-limbi.md](specs/M2-001-limbi.md) · [PR #11](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/11) |
| 2 | `M2-002` | Pentru școli de programare & IT | done ✅ | orchestrator | [specs/M2-002-programare.md](specs/M2-002-programare.md) · [PR #12](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/12) |
| 3 | `M2-003` | Pentru școli de muzică | done ✅ | orchestrator | [specs/M2-003-muzica.md](specs/M2-003-muzica.md) · [PR #13](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/13) |
| 4 | `M2-004` | Pentru pregătire examene | done ✅ | orchestrator | [specs/M2-004-examene.md](specs/M2-004-examene.md) · [PR #14](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/14) |

**🎉 M2 milestone: 4/4 done.**

## Active milestone: M3 — Tools & calculators

Interactive tools that help prospects self-qualify and feel confident before booking a demo.

| # | ID | Title | Status | Owner | Spec |
|---|----|-------|--------|-------|------|
| 1 | `M3-001` | ROI Calculator interactiv | done ✅ | orchestrator | [specs/M3-001-roi.md](specs/M3-001-roi.md) · [PR #15](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/15) |
| 2 | `M3-002` | Migration Cost Estimator | done ✅ | orchestrator | [specs/M3-002-migrare.md](specs/M3-002-migrare.md) · [PR #16](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/16) |
| 3 | `M3-003` | Pricing Configurator | done ✅ | orchestrator | [specs/M3-003-pricing.md](specs/M3-003-pricing.md) · [PR #17](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/17) |

**🎉 M3 milestone: 3/3 done. M1+M2+M3 all complete (17 PRs).**

## Active milestone: MVP — Real backend product

Pivot from landing-only to functional SaaS with Postgres + auth + multi-tenant.

| # | ID | Title | Status | Owner | Spec |
|---|----|-------|--------|-------|------|
| 1 | `MVP-001` | Backend skeleton (Hono + Drizzle + PGlite) | done ✅ | orchestrator | [specs/MVP-001-backend-skeleton.md](specs/MVP-001-backend-skeleton.md) · [PR #18](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/18) |
| 2 | `MVP-002` | Database schema (9 tables) + seed | done ✅ | orchestrator | [specs/MVP-002-schema.md](specs/MVP-002-schema.md) · [PR #19](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/19) |
| 3 | `MVP-003` | Authentication (signup/login/session) | done ✅ | orchestrator | [specs/MVP-003-auth.md](specs/MVP-003-auth.md) · [PR #20](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/20) |
| 4 | `MVP-004` | Students CRUD (API + dashboard) | done ✅ | orchestrator | [specs/MVP-004-students-api.md](specs/MVP-004-students-api.md) · [PR #21](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/21) |
| 5 | `MVP-005` | Lessons + Schedule (CRUD + conflict) | done ✅ | orchestrator | [specs/MVP-005-lessons.md](specs/MVP-005-lessons.md) · [PR #22](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/22) |
| 6 | `MVP-006` | Teachers UI | done ✅ | orchestrator | — · [PR #23](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/23) |
| 7 | `MVP-007` | Payments (API + dashboard) | done ✅ | orchestrator | — · [PR #24](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/24) |
| 8 | `MVP-008` | Production deploy (Docker + guide) | done ✅ | orchestrator | — · [PR #25](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/25) |

**🎉 MVP milestone: 8/8 done. Full SaaS functional, deployable. 25 PRs total.**

## Quality gates (required before status → `done`)

1. **Build passes**: `npm run build` exits 0
2. **Type check passes**: `npm run typecheck` exits 0
3. **Lint passes**: `npm run lint` exits 0
4. **Tests pass**: `npm test` — all green
5. **Lighthouse ≥ 90**: performance, accessibility, best-practices, SEO
6. **Axe a11y**: 0 violations on critical/serious
7. **Reviewer agent**: returns `APPROVED`
8. **Manager persona agent**: ≤ 3 friction points (none critical)
9. **Student persona agent**: ≤ 3 friction points (none critical)
10. **Conventional commit + PR** opened on `main`

If any gate fails → status `blocked`, write report to `backlog/reports/<ID>-blocked.md`, move to the next item. Never halt the loop.
