# CONTRACT-501 — Integration Architect Report

**Reviewer:** integration-architect
**Verdict:** CONNECTED

## DB wiring
- New `contracts` table with proper foreign keys:
  - `tenant_id → tenants.id CASCADE DELETE`
  - `lead_id → leads.id SET NULL`
  - `student_id → students.id SET NULL`
  - `created_by → users.id SET NULL`
- Migration 0016 committed and verified: `db:reset + db:seed` green

## Cross-module data flow
- **Lead → Contract:** "Generează contract" button on LeadCardPage passes `leadId`, `name`, `course`, `valueCents` via query params to `/app/contracts`. The `createContract` API saves `leadId` as FK.
- **Student → Contract:** "Generează contract" button in StudentsPage (per-row) passes `studentId`, `name`, `phone`, `email` via query params. The API saves `studentId` as FK.
- **Tenant scoping:** All queries filter by `user.tenantId` — cross-tenant data access impossible.

## API contracts
- `GET /api/contracts` → `{ contracts: Contract[] }` (tenant-scoped, paginated)
- `POST /api/contracts` → `{ contract: Contract }` (201, with auto-number)
- `GET /api/contracts/:id/pdf` → HTML file (downloadable)
- `POST /api/contracts/ocr` → `{ ocr: OcrResult }` (graceful 200 even without AI key)

## UI wiring
- `/app/contracts` route added to `src/App.tsx`
- `Contracte` nav item added to AppShell sidebar + mobile bottom nav
- Pre-fill from lead/student via URL query params (`name`, `course`, `valueCents`, `leadId`, `studentId`)

## Tenant safety
- No raw `.execute().rows` — query builder only with portability wrapper

## Potential gaps (informational, non-blocking)
- The `dailySeq` counter under concurrent inserts could theoretically produce duplicate numbers; a transaction with `SELECT FOR UPDATE` or a DB sequence would be safer in production. Acceptable for MVP scope.
- PDF is HTML rendered to browser — no server-side puppeteer for true PDF binary. Acceptable per spec (out-of-scope for Phase 1).
