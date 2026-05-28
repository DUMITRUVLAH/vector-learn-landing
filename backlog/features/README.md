# Vector Learn — Features & Scenarios

> Documentația funcțională a produsului real (backend), **NU** a paginilor de landing.
>
> Cele 10 module M1 ale landing-ului prezintă vizual aceste features. Aici sunt definite în detaliu pentru când vom implementa backend-ul.

## Convenții

- **ID format**: `F-<MODULE>-<SCENARIO>-<NUMBER>` (ex: `F-ORAR-MOVE-001`)
- **Stadii**: `idea` → `specced` → `in_design` → `in_dev` → `live`
- **Audiență**: identifică **cine** face acțiunea (manager, profesor, recepționer, student, părinte, sistem-auto)
- **Tehnologie**: notează decizii cheie când e cazul (ex: "Stripe webhook", "ANAF SPV REST")

## Structură per feature doc

```markdown
---
id: F-XXX-YYY-NNN
title: <Scurt>
module: orar | finante | crm | comunicare | mobile | rapoarte | hr | multifilale | integrari | ai
status: idea | specced | in_design | in_dev | live
priority: P0 | P1 | P2
owner: <persona/echipă>
landing_demo: <link la M1-XXX dacă există>
---

# Goal

# Personas implicate

# Scenarii de utilizare
## Scenariul 1: ...
- Trigger: ...
- Pași: ...
- Output: ...

## Scenariul 2: ...

# Data model (preliminary)
- Entități noi
- Câmpuri obligatorii

# API surface
- Endpoints + payload-uri

# Acceptance criteria

# Edge cases

# Dependențe (terțe sau alte features)

# Risc & GDPR

# Out of scope
```

## Mapping landing demo → features documentate

| Landing item | Features documentate |
|---|---|
| M1-001 Orar | `F-ORAR-MOVE-001`, `F-ORAR-RECOVER-001`, `F-ORAR-CONFLICT-001` |
| M1-002 Finanțe | `F-FIN-RECURRING-001`, `F-FIN-INVOICE-001`, `F-FIN-SALARY-001`, `F-FIN-EFACTURA-001` |
| M1-003 CRM | `F-CRM-CAPTURE-001`, `F-CRM-PIPELINE-001`, `F-CRM-AUTOMATION-001`, `F-CRM-UTM-001` |

Restul (M1-004..010) vor primi feature docs după ce sunt livrate ca landing demos.

## Cum se folosește

1. **Înainte să scrii backend**: citește feature doc-ul relevant. Scenariile sunt sursa de adevăr pentru cum trebuie să se comporte API-ul.
2. **Înainte să modifici landing**: dacă schimbi un flux pe pagina M1-XXX, actualizează feature doc-ul corespunzător ca să nu derive.
3. **Pentru product reviews**: roleplay scenariile cu persona-manager / persona-student agents — ar trebui să producă acceptance criteria pentru backend.
