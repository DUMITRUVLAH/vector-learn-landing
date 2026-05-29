---
id: CRM-107
title: Task-uri & remindere per lead + atașamente
milestone: CRM
phase: B
priority: P0
core_ref: [CRM-CORE.md §6.1, §2.3]
tests: TEST-SCENARIOS.md#crm-107
depends_on: [CRM-106]
status: pending
---

# CRM-107 — Task-uri & fișiere

## Goal
Vânzătorul nu uită niciun follow-up: task-uri cu scadență per lead, vizibile și pe cardul kanban;
documentele (CI, contract) atașate de lead.

## In scope
- Tabele `lead_tasks` (title, due_at, status open|done|snoozed, assigned_to) și `lead_attachments`.
- Tab **Task-uri** în cartonaș: listă + „+ Adaugă task" (titlu, scadență, responsabil); bifare →
  `done` + `completed_at` + interaction `system`. Scadență trecută → roșu „Întârziat".
- Badge `⏰ <următorul task>` pe cardul kanban (cel mai apropiat task open).
- Tab **Fișiere**: upload/listă/download atașamente (nume, mime, mărime).

## Out of scope
- Remindere automate time-based (CRM-110 — acolo se trimit notificări; aici doar afișare/CRUD).

## Acceptance criteria
- [ ] Task cu scadență apare în tab + ca ⏰ pe card; întârziatul e roșu
- [ ] Bifare → done + completed_at + interaction system
- [ ] Upload/download fișiere funcțional, tenant-scoped
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-107` (T-CRM-107-1..4). Blocante verzi.

## DoD
Standard.
