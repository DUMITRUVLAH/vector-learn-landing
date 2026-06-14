---
id: SPLIT-303
title: "E2E smoke: ambele login-uri izolate; acces încrucișat respins; rute cheie 200"
milestone: SPLIT
phase: "4"
status: done
branch: feat/SPLIT-crm-cleanup
depends_on: [SPLIT-204, SPLIT-301]
spec: backlog/specs/SPLIT-303.md
---

## Goal

Test suite verifică separarea celor 2 aplicații: requireApp logic, AppShell isolation, Footer link.

## Acceptance Criteria

- [ ] requireApp('business') respinge sesiune learn → 403.
- [ ] requireApp('learn') respinge sesiune business → 403.
- [ ] AppShell CRM nu are /app/fin/, /app/par, /app/itpark în navigare.
- [ ] Footer → Business Suite link → /business.
- [ ] Toate testele vitest trec.
