---
id: CRM-125
title: Prognoză venit ponderată (Σ valoare × probabilitate stadiu) pe header + raport
milestone: CRM
phase: G
priority: P1
core_ref: [CRM-CORE.md §11.1, §2.6]
tests: TEST-SCENARIOS.md#crm-125
depends_on: [CRM-113, CRM-112]
status: pending
---

# CRM-125 — Prognoză venit ponderată

## Goal
Managerul (Andreea, ROI-focused) vrea să vadă „cât venit e realist în pipeline", nu doar suma brută.
Adăugăm prognoză ponderată: fiecare stadiu are o probabilitate de conversie, iar valoarea deal-ului
e ponderată cu ea.

## In scope
- `pipeline_stages` câștigă `win_probability INTEGER` (0–100, default per stadiu: new 10, contacted 30,
  trial 60, paid 100, lost 0). Editabil în editorul de stadii (CRM-105).
- Header kanban + raport (CRM-112): **„Pipeline ponderat: €X"** = Σ(value_cents × win_probability/100)
  pe leadurile deschise (non-lost, non-paid).
- Raport: bară pe stadiu cu valoare brută vs. ponderată; total prognozat luna curentă.
- Endpoint: extinde `GET /api/leads/pipeline` și raportul cu câmpurile ponderate.

## Out of scope
- Prognoză pe bază de istoric/ML (doar probabilitate statică pe stadiu).

## Acceptance criteria
- [ ] win_probability per stadiu editabil; default-uri rezonabile
- [ ] Calcul ponderat corect (exclude lost+paid din „deschis")
- [ ] Header + raport afișează brut + ponderat, formatare € ro-RO
- [ ] Migrare `pipeline_stages.win_probability` generată + commisă (§3.5.1)
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-125`. Blocante verzi.

## DoD
Standard.
