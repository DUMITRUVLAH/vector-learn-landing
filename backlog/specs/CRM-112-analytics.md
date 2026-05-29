---
id: CRM-112
title: Rapoarte CRM — funnel conversie + lost-reason + ROAS per campanie
milestone: CRM
phase: E
priority: P1
core_ref: [CRM-CORE.md §2.6]
tests: TEST-SCENARIOS.md#crm-112
depends_on: [CRM-111]
status: pending
---

# CRM-112 — Analytics

## Goal
Directorul vede unde pierde leaduri, de ce, și care campanie aduce bani — ca să mute bugetul.

## In scope
- Widget **funnel conversie** pe dashboard: new→contacted→trial→paid + procent, breakdown per sursă,
  comparație lună-lună.
- **Lost-reason analytics**: pie chart pe categorii (din `lost_reason`).
- **ROAS per campanie**: câmp `ad_spend_cents` per `utm_campaign` + cost-per-paying-student.
- Atribuire de bază first-touch/last-touch (linear = backlog).

## Out of scope
- Sync automat complet Meta Conversions API (stub), reactivare lost > 6 luni (backlog descoperit).

## Acceptance criteria
- [ ] Funnel corect din date reale + procent conversie + breakdown sursă
- [ ] Lost-reason pie chart agregat corect
- [ ] ROAS = spend / paying-students corect per campanie
- [ ] Tenant-scoped; 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-112` (T-CRM-112-1..4). Blocante verzi.

## DoD
Standard.
