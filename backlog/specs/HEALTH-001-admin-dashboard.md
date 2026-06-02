---
id: HEALTH-001
title: Super-admin dashboard — health check + tenant list
milestone: WAVE2
phase: 1
status: pending
priority: P1
depends_on: []
spec: backlog/specs/HEALTH-001-admin-dashboard.md
---

## Goal

Pagină `/app/admin` vizibilă doar pentru userul cu email definit în env `ADMIN_EMAIL`
(sau email care se termină cu `@vectorlearn.ro`). Arată lista de tenanți, statistici per tenant,
statusul DB și ultima versiune de migrare. Esențial pentru operarea SaaS multi-tenant.

## User stories

- Ca operator Vector Learn, vreau să văd toți tenanții și datele lor, pentru că operez un SaaS multi-tenant.
- Ca Dumitru (owner), vreau să știu ce versiune de migrare rulează prod-ul, pentru că verific deploy-urile.
- Ca suport, vreau să văd rapid câți elevi are un tenant, pentru că debughez rapid probleme.

## Acceptance criteria

1. `GET /api/admin/tenants` returnează `[{ id, name, createdAt, stats: { users, students, lessons } }]`
   - Disponibil DOAR pentru user cu email = ADMIN_EMAIL sau email ending `@vectorlearn.ro`
   - Orice alt user primește 403 Forbidden
2. `GET /api/admin/health` returnează `{ dbOk: boolean, migrationCount: number, tenantCount: number }`
3. Ruta `/app/admin` → AdminPage (în HashRouter, requires admin)
4. NavBar NU afișează "Admin" pentru useri non-admin
5. Tabelul tenanților include: Tenant, Elevi, Utilizatori, Lecții, Creat la
6. Pagina nu expune date sensibile (fără parole, tokens, etc.)

## Files

- `server/routes/admin.ts` — GET /api/admin/tenants + GET /api/admin/health
- `server/middleware/requireAdmin.ts` — middleware verificare email admin
- `server/app.ts` — montează `/api/admin` cu requireAdmin
- `src/pages/app/AdminPage.tsx` — dashboard tabel tenants + health
- `src/App.tsx` — route `/app/admin` → AdminPage

## Tests

- **T-HEALTH-001-1** [blocant] Given user normal autentificat, When GET /api/admin/tenants, Then 403
- **T-HEALTH-001-2** [blocant] Given admin user autentificat, When GET /api/admin/tenants, Then 200 cu array
- **T-HEALTH-001-3** [blocant] Given admin user, When GET /api/admin/health, Then 200 + dbOk: true + migrationCount >= 30
- **T-HEALTH-001-4** [normal] Given render AdminPage cu mock tenants, Then tabelul afișează Tenant, Elevi, Utilizatori
- **T-HEALTH-001-5** [normal] Given non-admin user, Then nu există link Admin în nav

## DoD

- [ ] GET /api/admin/tenants returnează 403 pentru non-admin și 200 pentru admin
- [ ] GET /api/admin/health returnează datele corecte
- [ ] Pagina /app/admin renderizează fără crash
- [ ] Build + lint + unit tests verzi
- [ ] Reviewer APPROVED
