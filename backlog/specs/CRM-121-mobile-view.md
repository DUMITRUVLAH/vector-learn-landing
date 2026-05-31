---
id: CRM-121
title: Vedere mobilă dedicată (listă + swipe-actions: sună/WhatsApp/mută stadiu)
milestone: CRM
phase: H
priority: P0
core_ref: [CRM-CORE.md §5, §6.1]
tests: TEST-SCENARIOS.md#crm-121
depends_on: [CRM-117, CRM-109]
status: pending
---

# CRM-121 — Vedere mobilă

## Goal
Recepționerul răspunde la telefon și gestionează leaduri **de pe mobil, în picioare**. Drag-drop
kanban pe telefon e un chin. Adăugăm o vedere mobilă nativă: listă verticală cu carduri compacte și
acțiuni rapide prin swipe.

## In scope
- Sub `lg` breakpoint, `/app/leads` afișează implicit **lista mobilă** (carduri verticale), nu kanban.
- Card mobil: nume + curs, badge stadiu, valoare, badge task/aging (CRM-116), avatar responsabil.
- **Swipe stânga** → acțiuni: 📞 Sună (`tel:`), 💬 WhatsApp (template), ✉ Email.
- **Swipe dreapta** → schimbă stadiu (bottom-sheet cu stadiile; `lost`→motiv, `paid`→conversie).
- Tap card → cartonaș (CRM-106), optimizat mobil (col. stângă peste tab-uri, nu lângă).
- Filtre + search într-un bottom-sheet (buton 🔍/⚙ în bara de jos).
- Bară de jos fixă: Azi · Leaduri · + Adaugă · Notificări.

## Out of scope
- App nativ (PWA/push e CRM-123). Doar web responsive aici.

## Acceptance criteria
- [ ] Sub lg → listă mobilă implicită; toggle spre kanban tot disponibil
- [ ] Swipe stânga/dreapta funcționează tactil; acțiunile corecte
- [ ] Schimbarea de stadiu prin swipe respectă regulile (lost→motiv, paid→conversie)
- [ ] Touch targets ≥ 44px (§3.3); tap card → cartonaș mobil lizibil
- [ ] 0 axe critical/serious; dark mode OK; testat la 360px lățime

## Tests
`TEST-SCENARIOS.md#crm-121`. Blocante verzi.

## DoD
Standard.
