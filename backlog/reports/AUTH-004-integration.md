# INTEGRATION REVIEW: AUTH-004 — 2FA TOTP + Session Management

Reviewer: integration-architect
Verdict: **CONNECTED**

## DB wiring
- `two_factor_settings` FK → `users.id` ON DELETE CASCADE: correct
- `sessions` extended with ip_address, user_agent, last_active_at, two_factor_pending: backward-compatible (nullable, default=false)
- Migration 0034 committed: `drizzle/0034_auth004_2fa_sessions.sql`
- Journal idx 34 with correct tag

## API wiring
- POST /api/auth/2fa/setup, /enable, /disable, /verify mounted at /api/auth/2fa/*
- GET/DELETE /api/auth/sessions/* mounted at /api/auth/sessions/*
- Login route updated to check twoFactorSettings, return {requiresTwoFactor: true} when active
- Sub-routes use requireAuth except /2fa/verify (which validates pending session)

## Cross-module flow
- login → checks twoFactorSettings → pending session → verify → complete session → app
- Session management UI shows all sessions by userId with ip/ua/lastActiveAt
- Delete /sessions/:id checks userId ownership (tenant-safe)
- Delete /sessions?except=current preserves current session

## UI wiring  
- SecurityPage at #/app/settings/security: registered in App.tsx
- Verify2FAPage at #/app/verify-2fa: registered in App.tsx
- AppShell nav has Securitate link

## No disconnected surfaces found.
