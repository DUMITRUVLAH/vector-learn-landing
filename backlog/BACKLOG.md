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
| 10 | `M1-010` | AI Assistant — module page | pending | orchestrator | [specs/M1-010-ai.md](specs/M1-010-ai.md) |

## Next milestone: M2 — Audience landing pages

Pages tailored per persona: `/pentru/limbi`, `/pentru/programare`, `/pentru/muzica`, etc.
Will be expanded after M1 reaches 100% done.

## Next milestone: M3 — Tools & calculators

- ROI calculator
- Migration cost estimator
- Interactive pricing configurator

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
