---
title: O regulă care prinde tot o face moartă pe cea specială scrisă după ea
category: architecture-patterns
date: 2026-09-26
tags: [crm, assignment, rules, ordering]
---

# O regulă care prinde tot o face moartă pe cea specială

**Cauza.** Distribuirea încearcă regulile în ordinea creării și se oprește la prima potrivită. Cu
scenariile gata făcute (CRM-A02), omul pornește întâi „Pe rând, la toată echipa” (fără condiții) și
abia apoi scrie „Google Ads → Maria”. În ordinea creării, a doua ar fi arătat „Pornită” și n-ar fi
prins niciodată nimic — fără nicio urmă în jurnal.

**Reparat.** `selectAssignee` (`server/lib/crm/assignment.ts`) încearcă regulile CU condiții
înaintea celor fără, apoi după `orderIndex`. Testul „o regulă cu condiții scrisă DUPĂ scenariul…”
din `server/__tests__/crmAssignment.routes.test.ts` pică pe codul vechi.

**Regula.** Oriunde un motor „prima regulă potrivită câștigă” primește reguli din două surse
(scenarii + reguli proprii), ordinea trebuie să pună specificul înaintea generalului — nu ordinea
în care au fost apăsate butoanele.
