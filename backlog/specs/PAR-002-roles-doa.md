---
id: PAR-002
title: "Roluri PAR + requirePARRole middleware + DOA matrix + seed DOA implicit"
milestone: PAR
phase: "A"
status: pending
attempts: 0
depends_on: [PAR-001]
spec: backlog/specs/PAR-002-roles-doa.md
core: backlog/par/PAR-CORE.md
---

## Goal

Adaugă stratul de autorizare al modulului: roluri PAR per-tenant (requestor/approver/finance/par_admin)
peste `users`/auth existent, un middleware `requirePARRole(...)`, API pentru membri/roluri, și matricea
Delegation of Authority (DOA) cu seed implicit (CORE §1, §3). Acest item NU rutează încă cereri (asta e
PAR-107) — doar definește cine are ce drepturi și regulile de aprobare.

## User stories

- **Ca** admin NGO, **vreau** să atribui roluri (cine cere, cine aprobă, cine plătește), **pentru că** fiecare persoană are responsabilități diferite.
- **Ca** organizație, **vreau** o matrice DOA pe praguri de sumă, **pentru că** sumele mari trebuie să ajungă la Directorul Executiv.
- **Ca** dezvoltator, **vreau** un singur middleware de rol reutilizabil, **pentru că** toate rutele PAR îl folosesc consistent.

## Acceptance criteria

- [ ] `server/middleware/requirePARRole.ts` — layered peste `requireAuth`; citește rolurile userului din `par_members` (un user poate avea mai multe); 403 dacă niciunul nu se potrivește
- [ ] `GET/POST/DELETE /api/par/members` (doar par_admin) — listează/atribuie/revocă roluri + `approval_limit_cents`
- [ ] `GET /api/par/me` — întoarce rolurile PAR ale userului curent (pentru UI role-aware)
- [ ] `GET/POST/PATCH/DELETE /api/par/doa` (par_admin) — CRUD pe `par_doa_matrix`
- [ ] Helper `resolveApprovalChain(tenantId, { totalCents, chargeTo, departmentId })` → listă ordonată de pași `{ step, approverRoleLabel, approverUserId?, approverParRole }` din matricea activă (CORE §3) — funcție pură testabilă, folosită de PAR-107
- [ ] Seed DOA implicit pentru tenantul demo: ≤ prag → 1 pas (Approver/DOA Holder); > prag → 2 pași (DOA Holder → Executive Director); > 100k → 3 pași
- [ ] Toate query-urile tenant-scoped; izolare verificată
- [ ] `server/app.ts` montează rutele `/api/par/members`, `/api/par/doa`, `/api/par/me` (același commit — route-mount rule)

## Files

**New:**
- `server/middleware/requirePARRole.ts`
- `server/routes/parMembers.ts`
- `server/routes/parDoa.ts`
- `server/lib/par/doa.ts` — `resolveApprovalChain` + tipuri
- `server/lib/par/__tests__/doa.test.ts`

**Modified:**
- `server/app.ts` — mount routes
- `server/db/seed.ts` — seed DOA matrix implicit (idempotent)

## Tests

- **T-PAR-002-1** [blocant] Given user fără rol PAR, When endpoint `requirePARRole("approver")`, Then 403
- **T-PAR-002-2** [blocant] Given seed, Then matrice DOA implicită (≤prag→1 pas; >prag→2 incl. Executive Director)
- **T-PAR-002-3** [blocant] Live API smoke: login admin → `GET /api/par/doa` → 200 cu rânduri
- **T-PAR-002-4** [normal] Given approver cu limită 5000_00, When evaluăm 7000 MDL, Then pasul superior e necesar
- **T-PAR-002-5** [blocant] Given `resolveApprovalChain` cu total>prag, Then întoarce ≥2 pași în ordine

## DoD

- Migration gate verde · live API smoke verde · reviewer APPROVED · personas salvate
- integration-architect: reutilizează `users`/`requireAuth`, fără sistem de auth paralel
