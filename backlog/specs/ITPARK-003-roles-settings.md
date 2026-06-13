---
id: ITPARK-003
title: "Roluri ITPARK (contabil/auditor/viewer) + settings (prag 70%, toleranță) + gating"
milestone: ITPARK
phase: "A"
status: pending
attempts: 0
depends_on: ["ITPARK-001"]
spec: backlog/specs/ITPARK-003-roles-settings.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Roluri și setări per tenant pentru modul: cine poate edita/marca verificat, plus pragul de
eligibilitate și toleranța (versionabile, nu hardcodate). Gating de acces pe API + UI.

## User stories
- **Ca** owner, **vreau** ca doar Contabilul să editeze dosarul, iar Auditorul doar să verifice,
  **pentru că** separarea de roluri e cerută în munca de audit.
- **Ca** dezvoltator, **vreau** pragul 70% în settings, **pentru că** se poate schimba și nu vreau
  să-l caut prin cod.

## Acceptance criteria
- [ ] **Stocare rol (implementare concretă):** NU se creează un tabel junction separat. Refolosește
  `userRoleEnum` existent: admin/manager → acces contabil (poate edita dosare). Rolul de auditor se
  stochează ca `itpark_settings.auditorUserId uuid references users(id)` (câmp nou în tabel, nullable);
  helper `requireItparkRole(role: 'accountant'|'auditor'|'viewer', c)` derivă accesul din
  `c.var.user.role` + settings. Viewer = orice alt user autentificat în tenant.
- [ ] `GET/PUT /api/itpark/settings` → `eligibilityThresholdPct` (default 70), `toleranceMonths`
  (default 2), `defaultCurrency` (MDL), `defaultAuditFirm?`, `auditorUserId?`; doar admin/manager pot PUT
- [ ] Rute montate în `app.ts` (același commit)
- [ ] UI „Setări ITPARK" sub `/app/fin/itpark/settings` — tokens design-system, dark mode, a11y
- [ ] Auditor (user desemnat prin `auditorUserId`): read-only pe dosar + poate marca „verificat";
  Viewer (oricine altcineva): read-only total; izolare tenant pe fiecare query
- [ ] Pragul/toleranța se citesc din settings oriunde sunt folosite (nu literal `70` în cod de calcul)

## Files
**New:** `server/routes/itparkSettings.ts`, `src/lib/api/itparkSettings.ts`, `src/pages/app/fin/itpark/ItparkSettings.tsx`, test
**Modified:** `server/app.ts` (mount), `server/lib/itparkAuth.ts` (helper rol)

## Tests
- **T-003-1** [normal] settings default: prag 70, toleranță 2, MDL
- **T-003-2** [blocant] viewer nu poate PUT settings (403); accountant poate
- **T-003-3** [blocant] rute montate → 200 (nu HTML fallback)

## DoD
- check-route-mounts + check-refs verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED (refolosește users/roluri)
- Persona reports salvate
