# Night build plan (autonomous, §0.3)

> Owner is asleep. Build continuously, no questions. When the backlog is empty, generate the
> next module's items per CLAUDE.md §5 (derive from `backlog/user-stories/<module>.md`), then
> build them through the full hardened pipeline. **Stack each item on the previous** (branch off
> the prior item's branch, not off main) so migration files stay sequential — avoids the
> migration-0007 collision seen in Phase F. One PR per item against main; owner merges the stack.

## Module build order (real backend, not landing)
Each module → 3–5 items. Source of behavior: the matching `backlog/user-stories/*.md`.

1. **Comunicare** (`COMM-2xx`) — message-sending infra (email/SMS/WhatsApp providers as stubs),
   per-lead/student message log, notifications, send-from-template (reuse CRM-108 templates),
   delivery status. Respect `consent_revoked_at`.
2. **Rapoarte** (`REP-3xx`) — real reports beyond CRM: revenue over time, attendance, teacher
   utilization, student retention/churn, dashboard widgets. Tenant-scoped, date-range filters.
3. **HR** (`HR-4xx`) — staff management, roles & permissions matrix, salaries + commissions
   (teachers exist), attendance/timesheet, payroll summary.
4. **Orar** (`SCHED-5xx`) — calendar view, recurring lessons, teacher/room conflict detection,
   reschedule + recovery lessons, student attendance marking.
5. **Finanțe** (`FIN-6xx`) — invoices, recurring billing, debt (link CRM-113 `debt_cents`),
   payment reconciliation, e-factura export stub.
6. **Multifilale** (`BRANCH-7xx`) — branch entity, branch-scoped data + switcher, per-branch
   reports, cross-branch roll-up for owner.
7. **Settings/Users** (`SET-8xx`) — user management (invite/roles), tenant settings, audit log.
8. **Integrări** (`INT-9xx`) — outbound webhooks, API keys, Zapier-style triggers.
9. **AI** (`AI-Axx`) — lead scoring model, AI assistant endpoints (stubbed LLM), smart suggestions.

## Per-item rules (same as CLAUDE.md)
- One item = one PR; stack on the previous item's branch.
- Full hardened gates: build, typecheck, lint, unit, migration discipline, live API integration
  smoke (login + endpoints 200), driver-portability. Repair red gates, don't skip.
- Review→improve loop incl. integration-architect (modules must connect to students/leads/etc.).
- Romanian copy, Vector 365 tokens, dark-mode parity, tenant-scoped, zero `any`.
- DB: Supabase via DATABASE_URL in .env (or PGlite fallback). Migrations committed.

## Progress log (orchestrator appends one line per item)
- (start) all CRM done (101–116). Beginning Comunicare module.
- COMM-201..205 done (PRs #44..48) — Comunicare module
- REP-301..304 done (PRs #49..52) — Rapoarte module
- HR-401 done → PR #53 (calcul salariu lunar payroll_entries + UI breakdown)
- HR-402 done → PR #54 (stats profesor: ore, prezență, venituri)
- HR-403 done → PR #55 (disponibilitate profesor: grid 7×16h + drag-to-mark)
