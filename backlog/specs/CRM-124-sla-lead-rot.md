---
id: CRM-124
title: SLA timp de răspuns + lead-rot escalation (leaduri uitate ies în „Atenție")
milestone: CRM
phase: G
priority: P0
core_ref: [CRM-CORE.md §11.4, §2.2]
tests: TEST-SCENARIOS.md#crm-124
depends_on: [CRM-116, CRM-120]
status: pending
---

# CRM-124 — SLA & lead-rot

## Goal
Un lead fierbinte ignorat 2 ore = bani pierduți. Direct lucrativ: punem un cronometru pe leadul nou
și scoatem în față leadurile care „putrezesc" necontactate.

## In scope
- **SLA pe leadul nou**: de la `created_at` până la primul `lead_interaction` outbound, calculează
  „timp până la primul răspuns". Pe card/listă: badge verde (< prag), galben, roșu (> prag).
  Prag configurabil per tenant (default: 15 min pentru leaduri „hot", 24h restul). Setare în Setup.
- **Lead-rot escalation**: leaduri în stadiu activ (new/contacted/trial) fără niciun contact de
  N zile (configurabil) → apar într-o secțiune „Atenție necesară" pe dashboard-ul „Azi" (CRM-120)
  și primesc badge roșu „Neglijat {n}z" pe card.
- Endpoint: extinde `GET /api/leads/today` cu lista „neglijate”; calcul SLA în pipeline endpoint.
- Setări `tenant_settings` (creează dacă nu există): `sla_hot_minutes`, `sla_default_hours`,
  `rot_days`.

## Out of scope
- Escaladare automată prin email către manager (poate fi o automatizare CRM-110 ulterior).

## Acceptance criteria
- [ ] SLA calculat corect (created → primul outbound); badge color după prag
- [ ] Praguri configurabile per tenant; default rezonabil
- [ ] Leaduri neglijate apar în „Atenție" pe dashboard + badge pe card
- [ ] Migrare `tenant_settings` (dacă nouă) generată + commisă (§3.5.1)
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-124`. Blocante verzi.

## DoD
Standard.
