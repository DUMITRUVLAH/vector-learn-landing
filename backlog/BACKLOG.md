# Vector Learn — Backlog (Autopilot)

> Single source of truth for the autonomous build pipeline.
>
> The orchestrator reads this file. Each item points to a detailed spec in `backlog/specs/`.
> Status values: `pending` → `in_progress` → `review` → `done` → `blocked`.
>
> **NEVER edit by hand while autopilot is running.** Use the orchestrator agent.

---

## 🔴 Active milestone: AUDIT-FIX faza-1 — bug-uri raportate de owner (2026-06-17, PRIORITAR)

Audit full al aplicației (logare, sidebar, salarizare). Cauze confirmate din cod:
- **FinNav** linkează `/app/fin/*` (17 link-uri) dar rutele reale sunt `/business/fin/*` → catch-all
  `RedirectToBusiness` → **userul e ejectat la fiecare click** („mă scoate din aplicație").
- **Payroll**: App.tsx montează pagina CRM greșită (`pages/app/PayrollPage` → `/api/hr/payroll` NEmontat)
  în loc de `pages/fin/PayrollPage` (`/api/fin/payroll/runs`, montat) → „Nu pot încărca datele de
  salarizare" / „Eroare la calculul salarizării".
- Risc de clasă: alte nav-link-uri moarte + API-uri client fără mount server.
O fază = un branch = un PR: `feat/AUDIT-FIX-faza-1-sidebar-payroll` (§0.2).

| Phase | ID | Title | Status | Spec |
|-------|----|-------|--------|------|
| 1 | `FIX-501` | FinNav dead-links `/app/fin/*` → `/business/fin/*` (stop eject) | done ✅ | [FIX-501](specs/FIX-501-finnav-dead-links.md) · [PR #183](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/183) |
| 1 | `FIX-502` | Payroll: montează pagina FinDesk corectă + API live | done ✅ | [FIX-502](specs/FIX-502-payroll-wrong-page-and-route.md) · [PR #183](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/183) |
| 1 | `FIX-503` | Audit full dead-links + guard automat anti-regresie | done ✅ | [FIX-503](specs/FIX-503-app-wide-deadlink-audit-guard.md) · [PR #183](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/183) |

---

## Active milestone: PAR — Payment Action Request workflow (NEW APP, added 2026-06-12)

A digital, online, multi-role workflow that replaces the paper **Payment Action Request (PAR) Form**
used by donor-funded NGOs (sample: ATIC / Digital Safeguard, Republic of Moldova). Staff **request** a
payment → **approvers** sign off per a **Delegation of Authority (DOA)** matrix → **finance** executes
it → the system regenerates the exact paper form as a **PDF**. Reuses this repo's stack (Hono + Drizzle
+ PGlite/Supabase, multi-tenant, auth, jsPDF, Vector 365). Behavior contract: [par/PAR-CORE.md](par/PAR-CORE.md).
Driver: [par/BUILD-SEQUENCE.md](par/BUILD-SEQUENCE.md). Tests: [par/TEST-SCENARIOS.md](par/TEST-SCENARIOS.md).

| Phase | ID | Title | Status | Spec |
|-------|----|-------|--------|------|
| A | `PAR-001` | Schema `par.ts` + enums + migration 0113 + seed demo NGO | pending | [PAR-001](specs/PAR-001-schema.md) |
| A | `PAR-002` | Roles + `requirePARRole` + DOA matrix + seed DOA | pending | [PAR-002](specs/PAR-002-roles-doa.md) |
| A | `PAR-003` | Org config: budget codes/departments/projects/vendors/settings | pending | [PAR-003](specs/PAR-003-org-config.md) |
| B | `PAR-101` | Create API — header (sections 1–9) + draft + numbering | pending | [PAR-101](specs/PAR-101-create-api.md) |
| B | `PAR-102` | Line items (section 10) + auto-sum + 10% note | pending | [PAR-102](specs/PAR-102-line-items.md) |
| B | `PAR-103` | End-use (11) + payee (12) + IBAN/IDNP validation | pending | [PAR-103](specs/PAR-103-enduse-payee.md) |
| B | `PAR-104` | Attachments (section 13) | pending | [PAR-104](specs/PAR-104-attachments.md) |
| B | `PAR-105` | Create wizard UI `/app/par/new` | done | [PAR-105](specs/PAR-105-create-wizard.md) |
| B | `PAR-106` | Dashboard + list `/app/par` | done | [PAR-106](specs/PAR-106-dashboard-list.md) |
| C | `PAR-107` | DOA routing engine (submit → approval chain) | done | [PAR-107](specs/PAR-107-routing-engine.md) |
| C | `PAR-108` | Approver inbox + approve/reject/request-changes | done | [PAR-108](specs/PAR-108-approver-inbox.md) |
| C | `PAR-109` | Sequential multi-level approval + integrity | done | [PAR-109](specs/PAR-109-sequential-approval.md) |
| C | `PAR-110` | Timeline & audit per PAR | pending | [PAR-110](specs/PAR-110-timeline-audit.md) |
| C | `PAR-111` | Notifications (in-app + email) | pending | [PAR-111](specs/PAR-111-notifications.md) |
| D | `PAR-112` | Finance queue + section 16 | done | [PAR-112](specs/PAR-112-finance-queue.md) |
| D | `PAR-113` | Payment execution + 10% overage re-approval | done | [PAR-113](specs/PAR-113-payment-execution.md) |
| E | `PAR-114` | PDF generator (faithful to the form) | done ✅ | [PAR-114](specs/PAR-114-pdf-generator.md) · [PR #142](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/142) |
| E | `PAR-115` | Download PDF + attach to record | done ✅ | [PAR-115](specs/PAR-115-pdf-download.md) · [PR #142](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/142) |
| F | `PAR-116` | Admin DOA matrix UI + members/roles | done ✅ | [PAR-116](specs/PAR-116-admin-doa.md) · [PR #143](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/143) |
| F | `PAR-117` | Reports + CSV export | done ✅ | [PAR-117](specs/PAR-117-reports.md) · [PR #143](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/143) |
| F | `PAR-118` | Full detail page (16 sections, role-aware actions) | done ✅ | [PAR-118](specs/PAR-118-detail-page.md) · [PR #143](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/143) |

**PAR milestone: 21/21 done (Phases A–F complete). Module COMPLETE.**

---

## Active milestone: SPLIT — Business Suite shell unification (UI, owner-reported 2026-06-17)

Owner-reported interface bug: paginile „diferite funcționalități" de sub `/business/*` (ex.
**Parteneri** `/business/fin/parties`) ies din shell-ul **Business Suite** și se randează în chrome-ul
vechi **Vector Learn / CRM** (logo Vector Learn, tenant „Demo Lingua School", user CRM „Andreea Mitran").
Cerința: **totul trebuie să rămână în Business Suite** — chrome unic (logo, header, identitate
user/organizație din sesiunea Business, sidebar) pe orice rută `/business/*`. Cauza: `AppShell` comută
sidebar-ul pe Business, dar header-ul rămâne pe `useSession()` (CRM); `BusinessGuardPage` nu învelește
într-un shell unic.

| Phase | ID | Title | Status | Spec |
|-------|----|-------|--------|------|
| SHELL | `SPLIT-401` | Toate paginile `/business/*` rămân în shell-ul Business Suite (chrome unificat: logo, header din sesiunea Business, logout business) | done ✅ | [SPLIT-401](specs/SPLIT-401-business-shell-unification.md) · [PR #184](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/184) |
| SHELL | `SPLIT-402` | **Bug-ul persistă** — un SINGUR shell pe `/business/*`: toate paginile FinDesk (~32) trec de pe `AppShell` pe `BusinessShell` (sidebar identic peste tot) + scoate „Demo Lingua School" din header | pending | [SPLIT-402](specs/SPLIT-402-business-shell-convergence.md) |

> ⚠️ SPLIT-401 a corectat doar `FinLayout` + header-ul din `AppShell`. Bug-ul persistă: `/business/fin/banklink`
> (și ~32 pagini FinDesk) folosesc încă `AppShell` cu alt sidebar (`BUSINESS_NAV_GROUPS`) decât Dashboard-ul
> (`BusinessShell.NAV_GROUPS`) și arată „Demo Lingua School" în header. SPLIT-402 converge totul pe `BusinessShell`.

---

## Previous milestone: M1 — Module deep-dive pages

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
| 1 | `CRM-101` | Intake web public + UTM + captcha + consent GDPR | A | done ✅ | [specs/CRM-101-intake-web.md](specs/CRM-101-intake-web.md) · [PR #27](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/27) |
| 2 | `CRM-102` | Deduplicare robustă + merge manual | A | done ✅ | [specs/CRM-102-dedup-merge.md](specs/CRM-102-dedup-merge.md) · [PR #28](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/28) |
| 3 | `CRM-103` | Adăugare manuală extinsă + Import CSV | A | done ✅ | [specs/CRM-103-manual-import.md](specs/CRM-103-manual-import.md) · [PR #29](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/29) |
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
| 13 | `CRM-113` | Valoare deal (€) per lead + rollup valoare pe pipeline | F | done ✅ | [specs/CRM-113-deal-value.md](specs/CRM-113-deal-value.md) · [PR #40](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/40) |
| 14 | `CRM-114` | Companie + contacte multiple (B2B) + nume deal | F | done ✅ | [specs/CRM-114-company-contacts.md](specs/CRM-114-company-contacts.md) · [PR #42](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/42) |
| 15 | `CRM-115` | Tag-uri + câmpuri custom configurabile per tenant | F | done ✅ | [specs/CRM-115-tags-custom-fields.md](specs/CRM-115-tags-custom-fields.md) · [PR #43](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/43) |
| 16 | `CRM-116` | Semnale task pe card — „Fără task" + aging restanță | F | done ✅ | [specs/CRM-116-task-signals.md](specs/CRM-116-task-signals.md) · [PR #41](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/41) |

**Faza F: toate done ✅**

### Faza I — Completări & UX polish

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 17 | `CRM-129` | Filtru tag în kanban + reasignare bulk + vizualizare „Ziua mea" | I | done ✅ | [specs/CRM-129-tag-filter-bulk-assign.md](specs/CRM-129-tag-filter-bulk-assign.md) · [PR #84](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/84) |
| 18 | `CRM-130` | Shortcuts tastatură kanban (n/e/j/k//) + WIP limits + collapse coloană | I | done ✅ | [specs/CRM-130-keyboard-shortcuts-wip.md](specs/CRM-130-keyboard-shortcuts-wip.md) · [PR #85](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/85) |
| 19 | `CRM-131` | Lead card UX polish — skeleton, optimistic UI, inline note edit, empty states | I | done ✅ | [specs/CRM-131-lead-card-ux-polish.md](specs/CRM-131-lead-card-ux-polish.md) · [PR #86](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/86) |
| 20 | `CRM-132` | Timeline filters — filtrare activitate după tip (notă/apel/email/stadiu) | I | done ✅ | [specs/CRM-132-timeline-filters.md](specs/CRM-132-timeline-filters.md) · [PR #87](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/87) |
| 21 | `CRM-133` | Duplicate detection banner — alertă deduplicare proeminentă pe cartonașul lead | I | done ✅ | [specs/CRM-133-duplicate-detection-banner.md](specs/CRM-133-duplicate-detection-banner.md) · [PR #88](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/88) |
| 22 | `CRM-134` | @mentions in note-uri + notificare utilizator menționat | I | pending | [specs/CRM-134-mentions-notifications.md](specs/CRM-134-mentions-notifications.md) |
| 23 | `CRM-135` | Round-robin auto-assign pentru lead-uri noi | I | pending | [specs/CRM-135-round-robin-assign.md](specs/CRM-135-round-robin-assign.md) |
| 24 | `CRM-136` | Kanban card density toggle — compact/comfortable, persistat per user | I | done ✅ | [specs/CRM-136-kanban-density-toggle.md](specs/CRM-136-kanban-density-toggle.md) · [PR #91](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/91) |

### Faza J — Pipeline & lead UX (din audit-ul de UX, 2026-06-01)

> 15 îmbunătățiri reale de fricțiune operațională identificate într-un audit UX al paginii lead
> (`/app/leads/:id`) și al kanban-ului de leads (`/app/leads`). Ordonate pe impact/efort:
> întâi quick-win-uri și bug-uri (CRM-140/138/141/144/146), apoi restul. O fază = un branch = un PR
> (§0.2): `feat/CRM-faza-J-lead-ux`.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 25 | `CRM-137` | Selector responsabil cu nume (înlocuiește input UUID) — peste tot | J | done ✅ | [specs/CRM-137-assignee-picker.md](specs/CRM-137-assignee-picker.md) |
| 26 | `CRM-138` | Meniu „mută în stadiu" pe cardul kanban (desktop) — alternativă la drag, tastatură | J | done ✅ | [specs/CRM-138-card-stage-menu-desktop.md](specs/CRM-138-card-stage-menu-desktop.md) |
| 27 | `CRM-139` | Search auto-aplicat (debounced) în vederea Listă — consistent cu Kanban | J | done ✅ | [specs/CRM-139-debounced-search.md](specs/CRM-139-debounced-search.md) |
| 28 | `CRM-140` | Fix: „Deschide" din alerta de duplicat navighează la lead (bug) | J | pending | [specs/CRM-140-open-duplicate-fix.md](specs/CRM-140-open-duplicate-fix.md) |
| 29 | `CRM-141` | „+ Adaugă lead" direct în coloana goală a kanban-ului | J | pending | [specs/CRM-141-add-lead-in-empty-column.md](specs/CRM-141-add-lead-in-empty-column.md) |
| 30 | `CRM-142` | Sortare per-coloană în kanban (recent / vechi / valoare / SLA) | J | pending | [specs/CRM-142-kanban-column-sort.md](specs/CRM-142-kanban-column-sort.md) |
| 31 | `CRM-143` | Toast cu „Anulează" la mutarea de stadiu (undo) | J | pending | [specs/CRM-143-undo-stage-move.md](specs/CRM-143-undo-stage-move.md) |
| 32 | `CRM-144` | Buton „copiază" pentru telefon / email pe cartonaș | J | pending | [specs/CRM-144-copy-contact.md](specs/CRM-144-copy-contact.md) |
| 33 | `CRM-145` | Auto-scor lead la încărcare + explicație factori scor | J | pending | [specs/CRM-145-auto-score-explained.md](specs/CRM-145-auto-score-explained.md) |
| 34 | `CRM-146` | Iconițe contact mai vizibile pe card + flag „fără telefon/email" | J | pending | [specs/CRM-146-contact-icons-missing-flag.md](specs/CRM-146-contact-icons-missing-flag.md) |
| 35 | `CRM-147` | Badge restanță pe tab-ul Task-uri al cartonașului | J | pending | [specs/CRM-147-task-overdue-tab-badge.md](specs/CRM-147-task-overdue-tab-badge.md) |
| 36 | `CRM-148` | „Convertit" duce la fișa studentului (link din cartonaș + card) | J | pending | [specs/CRM-148-converted-link-to-student.md](specs/CRM-148-converted-link-to-student.md) |
| 37 | `CRM-149` | Pills cu filtrele active + „×" individual pe fiecare | J | done | [specs/CRM-149-active-filter-pills.md](specs/CRM-149-active-filter-pills.md) |
| 38 | `CRM-150` | Import CSV: mapare valoare/companie/tag + parser robust | J | done | [specs/CRM-150-csv-import-fields-parser.md](specs/CRM-150-csv-import-fields-parser.md) |
| 39 | `CRM-151` | Mobil: acțiuni secundare în meniu „⋯"; doar FAB pentru adăugare | J | done | [specs/CRM-151-mobile-action-overflow-menu.md](specs/CRM-151-mobile-action-overflow-menu.md) |

## Active milestone: COMM — Modulul Comunicare (mesagerie reală backend)

> Fundație mesagerie + log per lead/student + inbox unificat + broadcast + notificări automate.
> Refolosește CRM-108 templates. Respectă `consent_revoked_at`. Stacked branches pentru migrări secvențiale.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `COMM-201` | Infra provideri: stub email/SMS/WhatsApp + tabel messages + delivery status | 1 | done ✅ | [specs/COMM-201-provider-infra.md](specs/COMM-201-provider-infra.md) · [PR #44](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/44) |
| 2 | `COMM-202` | Log mesaje per lead/student + send-from-template din cartonaș | 2 | done ✅ | [specs/COMM-202-message-log.md](specs/COMM-202-message-log.md) · [PR #45](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/45) |
| 3 | `COMM-203` | Inbox unificat /app/inbox — conversații threaded per contact | 3 | done ✅ | [specs/COMM-203-inbox.md](specs/COMM-203-inbox.md) · [PR #46](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/46) |
| 4 | `COMM-204` | Broadcast cu segmentare — trimitere masă per segment | 4 | done ✅ | [specs/COMM-204-broadcast.md](specs/COMM-204-broadcast.md) · [PR #47](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/47) |
| 5 | `COMM-205` | Notificări sistem automate + quiet hours + anti-spam cap | 5 | done ✅ | [specs/COMM-205-notifications.md](specs/COMM-205-notifications.md) · [PR #48](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/48) |

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

## Active milestone: FEEDBACK — Formulare de feedback (elevi/părinți)

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `FIN-601` | Facturi PDF cu serie incrementală + UI /app/invoices | 1 | done ✅ | [specs/FIN-601-invoices.md](specs/FIN-601-invoices.md) · [PR #76](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/76) |
| 2 | `FIN-602` | Datorie elev — link CRM-113 debt_cents + reconciliere plăți | 2 | done ✅ | [specs/FIN-602-debt-reconciliation.md](specs/FIN-602-debt-reconciliation.md) · [PR #77](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/77) |
| 3 | `FIN-603` | Abonamente recurente — generare automată facturi lunare | 3 | done ✅ | [specs/FIN-603-recurring-billing.md](specs/FIN-603-recurring-billing.md) · [PR #78](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/78) |
| 4 | `FIN-604` | e-Factura export stub (UBL 2.1 XML) + export SAGA CSV | 4 | done ✅ | [specs/FIN-604-efactura-stub.md](specs/FIN-604-efactura-stub.md) · [PR #79](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/79) |

## Active milestone: BRANCH — Modulul Multifiliale (branches + scoped access + reports)

> Fundație multi-branch: branches table, branch_id pe entități, switcher UI, scoped permissions,
> rapoarte consolidate vs per-filială.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `CX-701` | Model ediție/cohortă + funcții end-date/progress (din `useCXData`) | 1 | pending | [specs/CX-701-edition-model.md](specs/CX-701-edition-model.md) |
| 2 | `CX-702` | Pagină cohorte: tab-uri Active/Viitoare/Trecute + progres | 1 | pending | [specs/CX-702-cohort-board.md](specs/CX-702-cohort-board.md) |
| 3 | `CX-703` | Participanți per cohortă (CRM + manual) cu 3 tabele + stat | 1 | pending | [specs/CX-703-participants-tables.md](specs/CX-703-participants-tables.md) |
| 4 | `CX-704` | Export CSV participanți cohortă | 1 | pending | [specs/CX-704-export-csv.md](specs/CX-704-export-csv.md) |
| 5 | `CX-705` | Break-even + profit proiectat per cohortă (din `useProfitability`) | 1 | pending | [specs/CX-705-breakeven-badge.md](specs/CX-705-breakeven-badge.md) |

## Milestone: DIPLOMA — Generare diplome/certificate

> Portat din `copy-roas` (`DiplomaGenerator.tsx` + `VerifyCertificate.tsx`). Editor canvas
> drag&drop, QR de verificare, export PDF/JPG bulk. Branch: `feat/DIPLOMA-faza-1-certificates`.

| # | ID | Titlu | Fază | Status | Spec |
|---|----|-------|------|--------|------|
| 1 | `DIPLOMA-801` | Schema templates + certificate emise + token verificare | 1 | pending | [specs/DIPLOMA-801-schema-templates.md](specs/DIPLOMA-801-schema-templates.md) |
| 2 | `DIPLOMA-802` | Editor vizual canvas drag&drop câmpuri + salvare template | 1 | pending | [specs/DIPLOMA-802-canvas-editor.md](specs/DIPLOMA-802-canvas-editor.md) |
| 3 | `DIPLOMA-803` | Generare PDF/JPG per cursant + QR + persistă certificat | 1 | pending | [specs/DIPLOMA-803-generate-qr.md](specs/DIPLOMA-803-generate-qr.md) |
| 4 | `DIPLOMA-804` | Generare bulk pe cohortă + download ZIP | 1 | pending | [specs/DIPLOMA-804-bulk-zip.md](specs/DIPLOMA-804-bulk-zip.md) |
| 5 | `DIPLOMA-805` | Pagină publică verificare `/verify/:token` (no-auth) | 1 | done | [specs/DIPLOMA-805-public-verify.md](specs/DIPLOMA-805-public-verify.md) |

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

## Milestone: BUGFIX — found in 2026-06-01 prod functional test
See `backlog/reports/PROD-TEST-2026-06-01-buguri.md` for full reproduction.

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| BUGFIX-001 | 🔴 high | CX cohorts 500 + DIPLOMA certificate-templates 404 on prod (missing migrations / unmounted module) | pending |
| BUGFIX-002 | 🟡 normal | Payments default EUR but invoices default RON — inconsistent for RO client | pending |
| BUGFIX-003 | 🟢 minor | Invoice dueDate requires ISO datetime (would 400 if date field added to UI) | pending |
| BUGFIX-004 | 🟢 minor | Confirm students list default view doesn't mix archived with active | pending |

## Milestone: GAP — competitor feature gaps (2026-06-01 research)
See `backlog/reports/COMPETITOR-RESEARCH-2026-06-01.md`. Features leading platforms
(Teachworks, Jackrabbit, Classe365, Tutorbase) have that we verified we lack.

| ID | Value | Feature | Status |
|----|-------|---------|--------|
| PAY-901 | 🔴 high | Online card payments (Stripe) + auto-reconcile | pending |
| PORTAL-902 | 🔴 high | Parent/Student self-service portal | pending |
| PKG-903 | 🔴 high | Lesson packages / prepaid credits | pending |
| SCHED-904 | 🟡 normal | Makeup lessons + cancellation credits | pending |
| PROG-905 | 🟡 normal | Gradebook / student progress reports | pending |
| ENROLL-906 | 🟡 normal | Public online enrollment + pay | pending |
| LESSON-907 | 🟢 minor | Homework / assignments per lesson | pending |

## Milestone: SCHOOL + KINDER — new segment (private schools & kindergartens)
Research: `backlog/reports/RESEARCH-schools-kindergartens-2026-06-01.md`. Verified gaps vs
Gradelink/FACTS (schools) and Brightwheel/Famly/Procare (daycare). Bigger than a feature set —
a second product surface. Recommendation: daycare-first (KINDER-001/002/003) for the fastest MVP.

| ID | Value | Feature |
|----|-------|---------|
| SCHOOL-001 | 🔴 | Academic year + terms + permanent classes |
| SCHOOL-002 | 🔴 | Gradebook + report cards |
| SCHOOL-003 | 🔴 | Daily/class attendance register |
| SCHOOL-004 | 🔴 | Tuition billing (annual/term plans) |
| SCHOOL-005 | 🟡 | Admissions/enrollment workflow |
| SCHOOL-006 | 🟡 | Master timetable grid |
| SCHOOL-007 | 🟡 | Parent portal (grades/attendance/report cards) |
| KINDER-001 | 🔴 | Check-in/sign-out + authorized pickup + e-signature |
| KINDER-002 | 🔴 | Daily report / child diary (meals/naps/photos) |
| KINDER-003 | 🔴 | Staff-to-child ratio monitoring + alerts |
| KINDER-004 | 🔴 | Medical (allergies/immunization/medication) |
| KINDER-005 | 🟡 | Parent app feed + messaging |
| KINDER-006 | 🟡 | Licensing/compliance reports |
| KINDER-007 | ✅ | Incident/accident reports + signature |
| GUARDIAN-001 | 🔴 | Authorized-guardian model (multi-guardian, custody) |
| CONSENT-001 | 🟡 | Consent/permission forms + e-signature |

## Milestone: BRANCH faza-1 — Multifiliale (DONE, PR #110)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| BRANCH-701 | done | Schema branches + branch_id pe students/teachers/lessons | done |
| BRANCH-702 | done | Branch switcher UI + BranchContext | done |
| BRANCH-703 | done | Branch-scoped permissions (branch_scope pe users) | done |
| BRANCH-704 | done | Rapoarte consolidate vs per-filială | done |

## Active milestone: POLISH faza-1 — UX Polish

| ID | Priority | Title | Status | Spec |
|----|----------|-------|--------|------|
| POLISH-001 | high | Global quick search + command palette (Cmd+K) | pending | [spec](specs/POLISH-001-nav-quick-search.md) |
| POLISH-002 | high | Dashboard widget customization | pending | [spec](specs/POLISH-002-dashboard-widgets.md) |
| POLISH-003 | normal | Empty states cu CTA pentru paginile cheie | pending | [spec](specs/POLISH-003-empty-states.md) |

## Milestone: DOCMERGE faza-1 — Document Merge / Mass-PDF (NEW, added 2026-06-17 on owner request)

> Flux „mail-merge de documente": user încarcă un template cu placeholdere `{{tag}}` → sistemul
> detectează tag-urile → user încarcă un Excel → se generează N PDF-uri auto-completate (un PDF per
> rând), livrate ca ZIP. Refolosește: `extractVariables`/`renderTemplate` (CRM templates),
> Playwright HTML→PDF (finInvoiceDoc), `exceljs` lazy (par/excelExport), `JSZip` (certificateZip).
> O fază = un branch = un PR: `feat/DOCMERGE-faza-1-document-merge` (§0.2).

| ID | Priority | Title | Status | Spec |
|----|----------|-------|--------|------|
| DOCMERGE-001 | high | Upload template HTML/DOCX + detecție placeholdere `{{tag}}` | done | [spec](specs/DOCMERGE-001-template-upload-placeholders.md) |
| DOCMERGE-002 | high | Upload Excel, parsare rânduri, mapare coloane → placeholdere | done | [spec](specs/DOCMERGE-002-excel-import-mapping.md) |
| DOCMERGE-003 | high | Generare batch N PDF-uri din template+Excel, livrare ZIP | done | [spec](specs/DOCMERGE-003-batch-pdf-zip.md) |
| DOCMERGE-004 | normal | Wizard end-to-end + intrare în meniul business | done | [spec](specs/DOCMERGE-004-wizard-end-to-end.md) |

**DOCMERGE faza-1: 4/4 done. PR [#185](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/185)**

---

## 🟢 Milestone: VIOLETA — backlog PAR din prima ședință cu Violeta (2026-06-25)

> Sursa + deciziile owner-ului: [`Violeta-first-meeting.md`](../Violeta-first-meeting.md) (VM1-xx).
> Quick-win-urile au fost livrate deja; mai jos item-urile rămase, fiecare fază = un branch = un PR (§0.2).
> Decizii cheie: import = doar config; plată în valuta exactă (MDL/EUR/USD), rapoarte convertite în MDL;
> evenimente legate de proiect; fără IBAN în email; foldere Proiect → status; AI pre-completează
> payee+sumă+IBAN+scop; fără rol PAR → modulul ascuns.

| ID | Priority | Title | Status | Spec |
|----|----------|-------|--------|------|
| VM1-05 | high | Auto-salvare plătitor în registru la plată | done | [doc](../Violeta-first-meeting.md) · [PR #204](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/204) |
| VM1-06 | high | Max 10 atașamente + upload multiplu | done | [doc](../Violeta-first-meeting.md) · [PR #204](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/204) |
| VM1-08 | high | Email aprobare cu detalii plată (fără IBAN) | done | [doc](../Violeta-first-meeting.md) · [PR #205](https://github.com/DUMITRUVLAH/vector-learn-landing/pull/205) |
| VM1-09 | — | Aprobare în masă (deja exista, VF-102) | done | [doc](../Violeta-first-meeting.md) |
| VM1-01 | high | Access-control — modulul ascuns fără rol PAR | pending | [spec](specs/VM1-01-access-control.md) |
| VM1-02 | medium | Import config din Excel (proiecte/dept/buget) | pending | [spec](specs/VM1-02-import-config-excel.md) |
| VM1-13 | medium | AI pre-completează din document (payee/sumă/IBAN/scop) | pending | [spec](specs/VM1-13-ai-mapping.md) |
| VM1-03 | medium | Valute MDL/EUR/USD — rapoarte convertite în MDL (BNM) | pending | [spec](specs/VM1-03-currency-reports.md) |
| VM1-04 | medium | Evenimente legate de proiect (`parEvents` + `eventId`) | pending | [spec](specs/VM1-04-events.md) |
| VM1-10 | medium | Foldere PAR — Proiect → status (dep. VM1-04) | pending | [spec](specs/VM1-10-folders-project-status.md) |
