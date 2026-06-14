---
id: SPLIT-003
title: Login separat /business/login + validare app_kind pe ambele login-uri
milestone: SPLIT
phase: "1"
branch: feat/SPLIT-foundation
status: pending
depends_on: [SPLIT-002]
---

## Goal
Creează pagina de login separată `/business/login` pentru Business Suite.
Adaugă endpoint backend `/api/business/auth/login` care validează că user-ul aparține unui tenant cu `app_kind = 'business'`.
Protejează `/api/auth/login` (CRM) să returneze 403 dacă user-ul aparține unui tenant `business`.
Ambele login-uri redirecționează corect după autentificare:
- CRM → `/app/dashboard`
- Business → `/business/dashboard`

## User stories
- Ca admin Business Suite, vreau să mă loghez pe `/business/login` cu credențialele mele, pentru că login-ul CRM mă redirecționează greșit și nu dă acces la FinDesk.
- Ca admin CRM, dacă încerc să mă loghez cu cont business pe `/app/login`, vreau 403 "cont greșit pentru această aplicație", pentru că accesul încrucișat e blocat.
- Ca visitor, pe `/business/login` vreau să văd branding Business Suite (nu CRM), pentru că sunt aplicații separate.

## Acceptance criteria
- [ ] Pagina `src/pages/business/BusinessLoginPage.tsx` există — refolosește `AuthLayout`, are pre-fill `admin@demo.business.io / demo123456`.
- [ ] Ruta `#/business/login` e înregistrată în `src/App.tsx`.
- [ ] Endpoint `POST /api/business/auth/login` în `server/routes/businessAuth.ts` — validează email+parolă, verifică `tenant.app_kind === 'business'` (altfel 403 `{ error: "wrong_app" }`), creează sesiune, returnează user+tenant.
- [ ] `businessAuthRoutes` montat în `server/app.ts` la `/api/business`.
- [ ] `POST /api/auth/login` (CRM) verifică `tenant.app_kind === 'learn'` (sau null/default) — dacă e `'business'` → 403.
- [ ] Login business reușit → `navigate('/business/dashboard')` (stub page ok pentru acum).
- [ ] Pagina stub `src/pages/business/BusinessDashboardPage.tsx` cu text "Business Suite — în construcție".
- [ ] Ruta `#/business/dashboard` înregistrată.

## Files
- `server/routes/businessAuth.ts` — router NOU cu POST /login + POST /logout + GET /me
- `server/app.ts` — mount businessAuthRoutes la /api/business
- `server/routes/auth.ts` — adaugă validare app_kind pe /login (CRM must be 'learn')
- `src/pages/business/BusinessLoginPage.tsx` — pagina NOU
- `src/pages/business/BusinessDashboardPage.tsx` — stub NOU
- `src/App.tsx` — rute #/business/login, #/business/dashboard

## Tests
- **T-SPLIT-003-1** [blocant] Given admin@demo.business.io, When POST /api/business/auth/login, Then 200 cu user+tenant, app_kind='business'
- **T-SPLIT-003-2** [blocant] Given admin@demo.vectorlearn.io (learn), When POST /api/business/auth/login, Then 403 wrong_app
- **T-SPLIT-003-3** [blocant] Given admin@demo.business.io (business), When POST /api/auth/login (CRM), Then 403 wrong_app
- **T-SPLIT-003-4** [blocant] Given render BusinessLoginPage, When mount, Then fără crash, form vizibil
- **T-SPLIT-003-5** [normal] Given login business reușit, When navigate, Then redirect la /business/dashboard

## DoD
- Ambele login-uri funcționează izolat
- Cross-login returneaza 403
- Build + typecheck + lint verde
- `db:reset && db:seed` verde
- scripts/check-route-mounts verde
