---
id: MVP-003
title: Authentication — email/password + session
milestone: MVP
estimate_hours: 2
priority: P0
---

# MVP-003 — Authentication

## Goal
Implementează auth real cu email/password, session cookies, multi-tenant aware. Folosim Better-Auth (light, modern, TypeScript-first) cu adapter Drizzle.

## Acceptance criteria
- [ ] `/api/auth/sign-up` cu email + password + tenant_name (creează tenant + user admin)
- [ ] `/api/auth/sign-in` returnează session cookie
- [ ] `/api/auth/sign-out` invalidate session
- [ ] `/api/auth/me` returnează user + tenant curent (protected route example)
- [ ] Password hash cu bcrypt sau scrypt
- [ ] Session în Postgres (tabel `sessions`)
- [ ] Frontend: pagini `/app/login` și `/app/signup` reale
- [ ] Frontend: hook `useSession()` care fetch `/api/auth/me`
- [ ] Rate limit pe `/api/auth/sign-in` (5 încercări/IP/min)

## Files
- `server/auth/config.ts`
- `server/auth/routes.ts`
- `server/middleware/requireAuth.ts`
- `src/pages/app/LoginPage.tsx`
- `src/pages/app/SignupPage.tsx`
- `src/hooks/useSession.ts`
- `src/lib/api.ts` (fetch wrapper cu credentials: include)

## DoD
Pot să fac signup, login, vad în `/app/dashboard`, logout, login again.
