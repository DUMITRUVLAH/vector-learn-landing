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
| 9 | `CRM-109` | Comunicare din cartonaș + logare apel | C | done ✅ | [specs/CRM-109-comms.md](specs/CRM-109-comms.md) · [PR #36](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/36) |
| 10 | `CRM-110` | Motor automatizări (trigger→condiție→acțiune) | D | done ✅ | [specs/CRM-110-automation.md](specs/CRM-110-automation.md) · [PR #37](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/37) |
| 11 | `CRM-111` | Conversie → student cu familie + reasignare + scor | E | done ✅ | [specs/CRM-111-convert-family.md](specs/CRM-111-convert-family.md) · [PR #38](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/38) |
| 12 | `CRM-112` | Rapoarte: funnel + lost-reason + ROAS | E | done ✅ | [specs/CRM-112-analytics.md](specs/CRM-112-analytics.md) · [PR #39](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/39) |

### Faza F — paritate cu CRM-ul real (Kommo) — vezi [CRM-CORE §11](crm/CRM-CORE.md)
Features observate în CRM-ul de producție al owner-ului, lipsă din spec-ul inițial.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 13 | `CRM-113` | Valoare deal (€) per lead + rollup valoare pe pipeline | F | pending | [specs/CRM-113-deal-value.md](specs/CRM-113-deal-value.md) |
| 14 | `CRM-114` | Companie + contacte multiple (B2B) + nume deal | F | pending | [specs/CRM-114-company-contacts.md](specs/CRM-114-company-contacts.md) |
| 15 | `CRM-115` | Tag-uri + câmpuri custom configurabile per tenant | F | done ✅ | [specs/CRM-115-tags-custom-fields.md](specs/CRM-115-tags-custom-fields.md) · [PR #43](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/43) |
| 16 | `CRM-116` | Semnale task pe card — „Fără task" + aging restanță | F | pending | [specs/CRM-116-task-signals.md](specs/CRM-116-task-signals.md) |

**Ordine de build:** `CRM-101 → … → 112` (done) → `113 → 116 → 114 → 115` (valoare + semnale task întâi — impact maxim pe demo).

### Faza G+H — Funcționalități avansate pipeline

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 17 | `CRM-117` | List view tabelar cu sortare + filtre | G | done ✅ | [specs/CRM-117-list-view.md](specs/CRM-117-list-view.md) · [PR #63](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/63) |
| 18 | `CRM-118` | Acțiuni în masă (bulk): schimb stadiu, reasignare, tag, ștergere | G | done ✅ | [specs/CRM-118-bulk-actions.md](specs/CRM-118-bulk-actions.md) · [PR #66](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/66) |
| 19 | `CRM-119` | Căutare globală extinsă + Vizualizări salvate (Saved Views) | G | done ✅ | [specs/CRM-119-search-saved-views.md](specs/CRM-119-search-saved-views.md) |
| 20 | `CRM-120` | Today dashboard: tasks azi + leads fără task + activitate recentă | G | done ✅ | [specs/CRM-120-today-dashboard.md](specs/CRM-120-today-dashboard.md) · [PR #64](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/64) |
| 21 | `CRM-121` | Mobile view: kanban 2 coloane + gesturi touch | H | done ✅ | [specs/CRM-121-mobile-view.md](specs/CRM-121-mobile-view.md) · [PR #65](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/65) |
| 22 | `CRM-122` | Quick add mobile: FAB + pre-fill din context | H | done ✅ | [specs/CRM-122-quick-add-mobile.md](specs/CRM-122-quick-add-mobile.md) · [PR #68](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/68) |
| 23 | `CRM-123` | Notificări in-app: badge + feed notificări + preferințe | H | pending | [specs/CRM-123-notifications.md](specs/CRM-123-notifications.md) |
| 24 | `CRM-124` | SLA + lead rot: avertizare leaduri necontactate | G | done ✅ | [specs/CRM-124-sla-lead-rot.md](specs/CRM-124-sla-lead-rot.md) · [PR #67](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/67) |
| 25 | `CRM-125` | Forecast ponderat pe pipeline + probabilitate per stadiu | G | pending | [specs/CRM-125-weighted-forecast.md](specs/CRM-125-weighted-forecast.md) |
| 26 | `CRM-126` | Follow-up cadence: serie automatizată de follow-up-uri | H | pending | [specs/CRM-126-followup-cadence.md](specs/CRM-126-followup-cadence.md) |
| 27 | `CRM-127` | Undo + audit log acțiuni CRM | H | pending | [specs/CRM-127-undo-audit.md](specs/CRM-127-undo-audit.md) |
| 28 | `CRM-128` | Empty states + onboarding ghid primul lead | H | pending | [specs/CRM-128-empty-states-onboarding.md](specs/CRM-128-empty-states-onboarding.md) |

## Active milestone: COMM — Modulul Comunicare (mesagerie reală backend)

> Fundație mesagerie + log per lead/student + inbox unificat + broadcast + notificări automate.
> Refolosește CRM-108 templates. Respectă `consent_revoked_at`. Stacked branches pentru migrări secvențiale.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `COMM-201` | Infra provideri: stub email/SMS/WhatsApp + tabel messages + delivery status | 1 | pending | [specs/COMM-201-provider-infra.md](specs/COMM-201-provider-infra.md) |
| 2 | `COMM-202` | Log mesaje per lead/student + send-from-template din cartonaș | 2 | pending | [specs/COMM-202-message-log.md](specs/COMM-202-message-log.md) |
| 3 | `COMM-203` | Inbox unificat /app/inbox — conversații threaded per contact | 3 | pending | [specs/COMM-203-inbox.md](specs/COMM-203-inbox.md) |
| 4 | `COMM-204` | Broadcast cu segmentare — trimitere masă per segment | 4 | pending | [specs/COMM-204-broadcast.md](specs/COMM-204-broadcast.md) |
| 5 | `COMM-205` | Notificări sistem automate + quiet hours + anti-spam cap | 5 | pending | [specs/COMM-205-notifications.md](specs/COMM-205-notifications.md) |

## Active milestone: REP — Modulul Rapoarte (analytics real din DB)

> KPI dashboard + revenue charts + student LTV + export CSV.
> Tenant-scoped, period toggle, dark mode.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `REP-301` | Dashboard KPI: MRR, elevi activi, churn, ARPU + period toggle | 1 | done ✅ | [specs/REP-301-dashboard-kpi.md](specs/REP-301-dashboard-kpi.md) · [PR #49](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/49) |
| 2 | `REP-302` | Revenue over time: line chart MRR lunar + breakdown disciplină | 2 | done ✅ | [specs/REP-302-revenue-chart.md](specs/REP-302-revenue-chart.md) · [PR #50](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/50) |
| 3 | `REP-303` | Student retention: LTV per elev + top 10 + attendance rate | 3 | done ✅ | [specs/REP-303-student-retention.md](specs/REP-303-student-retention.md) · [PR #51](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/51) |
| 4 | `REP-304` | Export rapoarte: CSV plăți + CSV elevi + download din UI | 4 | done ✅ | [specs/REP-304-export.md](specs/REP-304-export.md) · [PR #52](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/52) |

## Active milestone: HR — Modulul HR (payroll + stats + disponibilitate + audit)

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `HR-401` | Calcul salariu lunar + payroll_entries tabel | 1 | done ✅ | [specs/HR-401-payroll.md](specs/HR-401-payroll.md) · [PR #53](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/53) |
| 2 | `HR-402` | Stats profesor: ore, prezență%, venituri | 2 | done ✅ | [specs/HR-402-teacher-stats.md](specs/HR-402-teacher-stats.md) · [PR #54](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/54) |
| 3 | `HR-403` | Disponibilitate profesor: grid săptămânal + conflict | 3 | done ✅ | [specs/HR-403-availability.md](specs/HR-403-availability.md) · [PR #55](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/55) |
| 4 | `HR-404` | Audit log HR: rate/rol/payroll cu actor + timestamp | 4 | done ✅ | [specs/HR-404-audit-log.md](specs/HR-404-audit-log.md) · [PR #56](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/56) |

## Active milestone: SCHED — Scheduler (săli + recurent + prezență + iCal)

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `SCHED-501` | Săli de clasă: rooms table + conflict detection + dropdown | 1 | done ✅ | [specs/SCHED-501-rooms.md](specs/SCHED-501-rooms.md) · [PR #57](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/57) |
| 2 | `SCHED-502` | Lecții recurente: pattern săptămânal + excepții | 2 | done ✅ | [specs/SCHED-502-recurring.md](specs/SCHED-502-recurring.md) · [PR #58](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/58) |
| 3 | `SCHED-503` | Prezență: marcare per lecție + raport prezență % | 3 | pending | [specs/SCHED-503-attendance.md](specs/SCHED-503-attendance.md) |
| 4 | `SCHED-504` | Export iCal: calendar personalizat profesor/elev | 4 | pending | [specs/SCHED-504-ical.md](specs/SCHED-504-ical.md) |

## Quality gates (required before status → `done`)

1. **Build passes**: `npm run build` exits 0
2. **Type check passes**: `npm run typecheck` exits 0
3. **Lint passes**: `npm run lint` exits 0
4. **Tests pass**: `npm test` — all green
5. **Migration gate** (backend items): `db:generate` leaves no uncommitted migration; `db:reset` + `db:seed` succeed — CLAUDE.md §3.5.1
6. **API integration smoke** (backend items): server boots, login + the item's endpoints return 200 — §3.5.1
7. **DB-portability**: no raw `.execute().rows` — §3.5.1
8. **Lighthouse ≥ 90** (page items): performance, accessibility, best-practices, SEO
9. **Axe a11y**: 0 violations on critical/serious
10. **Reviewer agent**: `APPROVED` after the review→improve loop (+ adversarial review on risky diffs) — §3.5.2
11. **Manager persona agent**: ≤ 3 friction points (none critical)
12. **Student persona agent**: ≤ 3 friction points (none critical)
13. **Conventional commit + PR** opened on `main`

Gates 5–7 are **repair-don't-skip** (CLAUDE.md §0.2): a red gate triggers a fix loop, not an
instant block. Only block if a real fix attempt fails and the cause is clearly structural →
write `backlog/reports/<ID>-blocked.md`, move to the next item. Never halt the loop.
