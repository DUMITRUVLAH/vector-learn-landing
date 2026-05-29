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

## Active milestone: CRM — Modulul CORE (lead → student → plătitor)

> **CRM-ul este inima produsului.** Documentația „cap-coadă" trăiește în
> [`backlog/crm/`](crm/README.md): [CRM-CORE.md](crm/CRM-CORE.md) (kanban, cartonaș, click-map,
> fluxuri de adăugare), [BUILD-SEQUENCE.md](crm/BUILD-SEQUENCE.md) (driverul pas-cu-pas),
> [TEST-SCENARIOS.md](crm/TEST-SCENARIOS.md) (gate dur).
>
> **Regulă (CLAUDE.md §0.2): un item odată, în ordine; testele lui trebuie verzi înainte de
> următorul.** Nu comasa item-uri, nu trece mai departe cu teste roșii, nu pierde feature-uri.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| — | `MVP-009` | CRM Leads (kanban + create + convert + note) | — | done ✅ (merged commit `433f73a`) | [specs/MVP-009-crm-leads.md](specs/MVP-009-crm-leads.md) |
| 1 | `CRM-101` | Intake web public + UTM + captcha + consent GDPR | A | pending | [specs/CRM-101-intake-web.md](specs/CRM-101-intake-web.md) |
| 2 | `CRM-102` | Deduplicare robustă + merge manual | A | pending | [specs/CRM-102-dedup-merge.md](specs/CRM-102-dedup-merge.md) |
| 3 | `CRM-103` | Adăugare manuală extinsă + Import CSV | A | pending | [specs/CRM-103-manual-import.md](specs/CRM-103-manual-import.md) |
| 4 | `CRM-104` | Webhook Facebook Lead Ads + Google gclid | A | pending | [specs/CRM-104-ads-webhooks.md](specs/CRM-104-ads-webhooks.md) |
| 5 | `CRM-105` | Pipeline: stadii custom + motiv pierdere + filtre | B | pending | [specs/CRM-105-pipeline.md](specs/CRM-105-pipeline.md) |
| 6 | `CRM-106` | Cartonaș detaliu `/app/leads/:id` (tab-uri, inline edit) | B | pending | [specs/CRM-106-lead-card.md](specs/CRM-106-lead-card.md) |
| 7 | `CRM-107` | Task-uri & remindere + atașamente | B | pending | [specs/CRM-107-tasks-files.md](specs/CRM-107-tasks-files.md) |
| 8 | `CRM-108` | Bibliotecă template-uri (email/WhatsApp/SMS) | C | pending | [specs/CRM-108-templates.md](specs/CRM-108-templates.md) |
| 9 | `CRM-109` | Comunicare din cartonaș + logare apel | C | pending | [specs/CRM-109-comms.md](specs/CRM-109-comms.md) |
| 10 | `CRM-110` | Motor automatizări (trigger→condiție→acțiune) | D | pending | [specs/CRM-110-automation.md](specs/CRM-110-automation.md) |
| 11 | `CRM-111` | Conversie → student cu familie + reasignare + scor | E | pending | [specs/CRM-111-convert-family.md](specs/CRM-111-convert-family.md) |
| 12 | `CRM-112` | Rapoarte: funnel + lost-reason + ROAS | E | pending | [specs/CRM-112-analytics.md](specs/CRM-112-analytics.md) |

**Ordine de build:** `CRM-101 → 102 → 103 → 104 → 105 → 106 → 107 → 108 → 109 → 110 → 111 → 112`.

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
