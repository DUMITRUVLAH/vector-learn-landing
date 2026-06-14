---
id: SPLIT-002
title: Middleware requireApp(kind) + marcare sesiune cu app_kind + respinge acces încrucișat
milestone: SPLIT
phase: "1"
branch: feat/SPLIT-foundation
status: pending
depends_on: [SPLIT-001]
---

## Goal
Adaugă un middleware `requireApp(kind: 'learn' | 'business')` care:
1. Verifică că sesiunea curentă aparține unui user al cărui tenant are `app_kind === kind`.
2. Dacă `app_kind` nu se potrivește → 403 `{ error: "wrong_app" }`.
Refolosește `requireAuth` existent (nu îl rescrie) — se aplică DUPĂ el.
Nu sunt necesare modificări de bază de date la sesiuni — lookup-ul se face pe tenant la fiecare cerere.

## User stories
- Ca user CRM (`learn`), dacă încerc să accesez `/api/business/*`, vreau să primesc 403, pentru că nu am acces la Business Suite.
- Ca user Business Suite (`business`), dacă încerc să accesez `/api/app/*` (CRM), vreau să primesc 403.
- Ca developer, vreau middleware composable (`requireAuth`, `requireApp('learn')`) pentru că e mai simplu de testat fiecare separat.

## Acceptance criteria
- [ ] `server/middleware/requireApp.ts` exportă `requireApp(kind)` — MiddlewareHandler.
- [ ] `requireApp` citește `user.tenantId` → lookup `tenants.app_kind` → compară cu `kind`.
- [ ] Mismatch → `c.json({ error: "wrong_app" }, 403)`.
- [ ] Caches tenantul pe context (`c.set("tenant", tenant)`) pentru eficiență downstream.
- [ ] Exportă tipul `AppVariables = AuthVariables & { tenant: Tenant }`.
- [ ] Unit test: mock tenant `app_kind='learn'` + request cu kind `'business'` → 403.
- [ ] Unit test: tenant `app_kind='business'` + kind `'business'` → next() apelat.

## Files
- `server/middleware/requireApp.ts` — middleware NOU
- `src/__tests__/requireApp.test.ts` — unit tests

## Tests
- **T-SPLIT-002-1** [blocant] Given user cu tenant app_kind='learn', When aplic requireApp('business'), Then 403 wrong_app
- **T-SPLIT-002-2** [blocant] Given user cu tenant app_kind='business', When aplic requireApp('business'), Then next() apelat (200)
- **T-SPLIT-002-3** [blocant] Given requireAuth nereușit (401), When ajung la requireApp, Then 401 (requireAuth oprește lanțul)
- **T-SPLIT-002-4** [normal] Given requireApp ok, When c.get("tenant"), Then returnează obiectul tenant complet

## DoD
- Middleware creat și testat
- Build + typecheck verde
- Nu sunt modificate rutele existente (middleware-ul nu e montat global — va fi aplicat selectiv în SPLIT-003 și fazele ulterioare)
