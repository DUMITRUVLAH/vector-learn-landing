---
id: SHELL-503
title: "Invite PAR + sign-in cu Google nu dă rolul invitatului (flux de redemption lipsă)"
milestone: SHELL
phase: "SHELL3"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/SHELL-503-invite-google-role-redemption.md
priority: high
---

## Problema (din E2E, 2026-06-26) — bug HIGH

Întrebarea owner-ului: „invităm pe cineva cu cont de Gmail, se loghează cu Google — primește rolul?
ce vede?" **Răspuns actual: NU primește rolul.** Fluxul de acceptare a invitației e incomplet:

1. **Rute server lipsă.** Clientul (`src/lib/api/par.ts`) cheamă `GET /api/auth/invite-info` și
   `POST /api/auth/accept-invite`, dar acestea **nu există** pe server → întorc HTML (SPA fallback,
   200) → clientul crapă pe `JSON.parse('<!doctype…')`. Comentariul din `parInvites.ts:7` zice că
   accept-invite e în `auth.ts`, dar nu e.
2. **Pagină lipsă.** Nu există rută `/app/invite` (sau `/business/invite`) și nici componentă
   InvitePage — doar funcții API orfane.
3. **Google callback ignoră invitațiile.** `server/routes/auth.ts` `/google/callback` creează un user
   nou cu `role:"admin"` pe un **tenant nou**, fără să consulte `par_invites` → niciun `par_members`
   link către tenant-ul care a invitat și rolul `requestor`.

Creare invitație FUNCȚIONEAZĂ (`POST /api/par/invites` → 201 + rând în `par_invites` + email cu
`/#/app/invite?token=…`). Doar redemption-ul e mort.

## Goal

Un invitat (email Gmail) care se loghează **cu Google** (sau cu parolă) pe baza invitației primește
rolul PAR corect (ex. `requestor`) **pe tenant-ul care l-a invitat**, și apoi vede doar partea lui
(conform SHELL-502).

## Acceptance criteria

- [ ] `GET /api/auth/invite-info?token=…` → întoarce JSON {email, par_role, tenant_name, expired?} (validează `tokenHash`, neexpirat, neacceptat)
- [ ] `POST /api/auth/accept-invite` → pentru user **autentificat**: creează `par_members(tenantId-ul invitației, userId, par_role)`, marchează `acceptedAt`, mintește/actualizează sesiunea pe tenant-ul corect. Idempotent. (Vezi nota cross-tenant.)
- [ ] **Google sign-in conștient de invitație**: dacă emailul Google match-uiește o invitație validă, userul nou e legat de **tenant-ul invitației** + rol, NU un tenant nou cu admin. La fel pe ruta business-login.
- [ ] Rută `#/app/invite?token=…` (+ redirect către `/business/invite`) + InvitePage: arată detaliile, buton „Acceptă", trece prin login (Google sau parolă) dacă e nevoie, apoi accept-invite.
- [ ] Token: `hashInviteToken` (SHA-256), one-time (acceptat → invalidat), expirare respectată.
- [ ] Securitate: nu permite escaladare de rol (un invite `requestor` nu poate ajunge admin); validează că invitatorul avea drept (`par_admin`) la creare (deja enforced).
- [ ] Email-ul de invitație: link `/#/business/invite?token=…` (nu `/app/invite` mort — vezi SHELL-501).
- [ ] Teste: invite→accept (parolă) dă rol; invite→Google dă rol pe tenant corect; token expirat/reused respins; requestor invitat vede doar partea lui.

## Decizii deschise (cross-tenant identity)

- Un user Gmail care **deja are cont** pe alt tenant și e invitat pe tenant-ul ONG: îl atașăm la
  tenant-ul invitației (multi-tenant membership) SAU îi dăm acces prin switch de tenant? Modelul curent
  pare single-tenant per user (user.tenantId). **De clarificat cu owner-ul** înainte de build —
  afectează dacă `par_members` poate referi un user de pe alt tenant, sau dacă invitatul devine user
  pe tenant-ul ONG.

## Files (estimat)

**New:**
- rute în `server/routes/auth.ts` (sau `server/routes/parInvites.ts`): `invite-info`, `accept-invite`
- `src/pages/business/InvitePage.tsx` + rută în `App.tsx`

**Modified:**
- `server/routes/auth.ts` `/google/callback` — consultă `par_invites` la sign-in
- `server/routes/businessAuth.ts` — la fel pe login business (memory: invite bridge pe AMBELE rute)
- `server/routes/parInvites.ts` — link email → `/business/invite`

## Riscuri

Cod de AUTH + multi-tenant + OAuth — sensibil la securitate. De implementat cu review adversarial
(ce-adversarial-reviewer / ce-security-reviewer) și teste de escaladare-de-rol. NU de grăbit.

## DoD

- Teste verzi (accept parolă + Google + token expirat/reused + scoping requestor) · review adversarial · deploy · re-rulare E2E T4
