---
id: CRM-122
title: Quick-add mobil în 3 atingeri + click-to-call nativ + detecție duplicat live
milestone: CRM
phase: H
priority: P1
core_ref: [CRM-CORE.md §8.2, §8.8]
tests: TEST-SCENARIOS.md#crm-122
depends_on: [CRM-121, CRM-102]
status: pending
---

# CRM-122 — Quick-add mobil

## Goal
Sună un părinte. Recepționerul, cu o mână, trebuie să adauge leadul în 3 atingeri, fără să piardă
apelul. Plus: din orice ecran, un tap pe telefon = apel real + logare automată.

## In scope
- **Quick-add bottom-sheet** (buton + din bara mobilă): doar **nume + telefon** obligatorii →
  „Salvează". Restul câmpurilor (curs, sursă, responsabil) opționale, sub „Mai multe".
- **Dedup live la tastare** telefon (refolosește CRM-102 `POST /api/leads/dedup-check`): dacă există
  → banner „Există deja: {nume} — Deschide / Creează oricum".
- **Click-to-call nativ**: orice telefon afișat e `tel:` tap-abil; la întoarcerea în app
  (sau buton „Am sunat") → bottom-sheet rapid de logare apel (outcome + notă, refolosește CRM-109).
- Confirmare optimistă + toast; leadul apare instant în listă (col. NEW).

## Out of scope
- Note vocale, OCR carte de vizită (viitor). Apel VoIP în-app (placeholder).

## Acceptance criteria
- [ ] Quick-add cu nume+telefon creează lead în ≤ 3 atingeri; restul opțional
- [ ] Dedup live afișează banner la match; „Deschide" duce la leadul existent
- [ ] `tel:` funcțional; logare apel rapidă scrie interaction type=call cu outcome
- [ ] Optimist UI + revert pe eroare
- [ ] Touch targets ≥ 44px; 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-122`. Blocante verzi.

## DoD
Standard.
