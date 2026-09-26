---
title: Dezactivarea unui cont trebuie să golească cache-ul de sesiuni
category: security-issues
date: 2026-09-26
tags: [auth, sessions, crm-team]
---

## Ce s-a întâmplat

Ruta nouă „Dezactivează contul" (CRM → Echipă, `server/routes/crmTeam.ts`) punea `users.is_active = false`
și ștergea rândurile din `sessions`, dar omul dezactivat mai primea `200` pe `/api/crm/*`. Testele de
integrare treceau — ele mock-uiesc `auth/session`. L-a prins smoke-ul live, cu serverul real.

## Cauza, într-o propoziție

`getSessionUser` (server/auth/session.ts, PERF-005) ține 30 s în memorie perechea sesiune + rândul
utilizatorului, deci `isActive` și `role` se citeau din cache, nu din bază.

## Regula

Orice rută care schimbă ceva ce citesc porțile de autentificare sau de drepturi de pe `user`
(`isActive`, `role`, `tenantId`) cheamă `dropAllCachedSessions()` după scriere. Contractul e scris în
`session.ts`; ruta nouă nu l-a citit.

## Garda

`server/__tests__/crm-team-invites.routes.test.ts` verifică explicit că dezactivarea și schimbarea de
rol cheamă `dropAllCachedSessions` (pică pe codul vechi, trece pe fix).
