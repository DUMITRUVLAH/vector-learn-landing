---
id: CRM-109
title: Comunicare din cartonaș — email/WhatsApp/SMS + logare apel
milestone: CRM
phase: C
priority: P0
core_ref: [CRM-CORE.md §6.1]
tests: TEST-SCENARIOS.md#crm-109
depends_on: [CRM-108]
status: pending
---

# CRM-109 — Comunicare din cartonaș

## Goal
Din cartonaș, vânzătorul trimite mesaje (cu template) și loghează apeluri — totul aterizează în
timeline-ul leadului.

## In scope
- Butoane `[Email] [WhatsApp] [Sună]` în col. stângă a cartonașului (CORE §6).
- Email/WhatsApp/SMS: compose cu selectare template (CRM-108), variabile pre-completate din lead;
  trimitere (provider stub în dev) → `interaction type=email|whatsapp|sms direction=outbound` cu
  `template_id` în `metadata`.
- `[Sună]` → `tel:` link; la închidere, modal „Logare apel": outcome
  (interested|not_interested|wrong_number|no_answer) + durată + notă → `interaction type=call` cu
  metadata. (Recording/transcript = placeholder, integrare reală amânată.)
- Toate outbound blocate dacă `consent_revoked_at` (mesaj clar).

## Out of scope
- Înregistrare/transcript real (placeholder), automatizări (CRM-110).

## Acceptance criteria
- [ ] Compose pre-completat din template + variabilele leadului
- [ ] Trimitere → interaction outbound cu template_id în metadata
- [ ] Logare apel cu outcome+durată → interaction call corect
- [ ] Consent retras → trimitere blocată

## Tests
`TEST-SCENARIOS.md#crm-109` (T-CRM-109-1..4). Blocante verzi.

## DoD
Standard.
