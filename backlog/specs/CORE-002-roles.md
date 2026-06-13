---
id: CORE-002
title: "Roluri FinDesk + requireFinRole middleware + CRUD membri + invitații"
milestone: FIN
phase: "1"
status: pending
attempts: 0
depends_on: [CORE-001]
spec: backlog/specs/CORE-002-roles.md
core: backlog/fin/FIN-CORE.md
---

## Goal

Controlul de acces pentru FinDesk: middleware care verifică rolul (`owner|accountant|cfo|viewer`),
CRUD pentru membri și invitarea de colegi. Reutilizează auth-ul existent (`requireAuth`, `users`).
Implementează regula #7 din FIN-CORE §2 (matricea de roluri).

## User stories

- **Ca** owner, **vreau** să invit colegi cu roluri diferite, **pentru că** echipa lucrează împreună cu accese clare.
- **Ca** dezvoltator, **vreau** un `requireFinRole(...)` reutilizabil, **pentru că** fiecare rută FinDesk gating consistent.
- **Ca** viewer, **vreau** să nu pot edita documente, **pentru că** rolul meu e doar de citire.

## Acceptance criteria

- [ ] `server/middleware/requireFinRole.ts`: `requireFinRole("owner"|"accountant"|"cfo"|"viewer")` — verifică `fin_members.role` pentru `user.tenantId`; 403 dacă insuficient
- [ ] Ierarhie: owner > accountant > cfo (read+reports) > viewer (read). `cfo` și `viewer` NU pot crea/edita documente de business; `accountant`+`owner` pot
- [ ] `server/routes/finMembers.ts`: `GET/POST/PATCH/DELETE /api/fin/members` — CRUD membri (doar owner)
- [ ] `POST /api/fin/members/invite` — invitație prin email (reuse `userInvitations`/`invitations` existent)
- [ ] Ruta montată în `server/app.ts` (`app.route("/api/fin/members", finMembersRoutes)`) — același commit (route-mount rule)
- [ ] Tenant isolation: un owner vede/editează doar membrii tenantului său
- [ ] Ultimul owner nu poate fi șters/retrogradat (guard)

## Files

**New:**
- `server/middleware/requireFinRole.ts`
- `server/routes/finMembers.ts`
- `server/routes/__tests__/finMembers.test.ts`

**Modified:**
- `server/app.ts` — mount `finMembersRoutes`

## Tests

- **T-CORE-002-1** [blocant] Given viewer, When `POST /api/fin/members`, Then 403
- **T-CORE-002-2** [blocant] Given owner, When CRUD membru, Then 200 + persistat, izolat pe tenant
- **T-CORE-002-3** [blocant] Tenant A owner NU vede membrii tenantului B
- **T-CORE-002-4** [blocant] Ștergerea ultimului owner → 400
- **T-CORE-002-5** [blocant] `check-route-mounts.mjs` verde (ruta montată)
- **T-CORE-002-6** [normal] Invitație → creează invitație + (mock) email

## DoD

- Live API smoke verde (login + /api/fin/members → 200)
- Reviewer APPROVED; integration-architect `CONNECTED` (reuse auth/invitations, fără COMPETING_SYSTEM)
- Persona reports salvate
