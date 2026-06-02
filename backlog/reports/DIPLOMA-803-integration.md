# DIPLOMA-803 Integration Report

**Verdict: CONNECTED**

## Routes
- `POST /api/certificates/issue` — mounted in app.ts, requireAuth, tenant-safe.
- `POST /api/certificates/issue-bulk` — same, tenant-safe, dedup on certificateId.

## DB
- `issuedCertificates` table from DIPLOMA-801: unique constraint on (tenantId, certificateId).
- No raw `.execute().rows` — Drizzle ORM with `Array.isArray` guard throughout.
- `verificationToken` is server-generated UUID default — never passed by client.

## Client ↔ Server
- `issueCertificate()` in `src/lib/api/certificates.ts` → POSTs to `/api/certificates/issue`.
- `generateCertificatePdf()` uses the returned `verificationToken` to render QR.
- QR URL format: `{origin}/#/verify/{token}` — correct for hash router.

## Cross-module
- Cohort participants loaded via `listParticipants(cohortId)` (CX-703 API).
- `buildCertificateId` from DIPLOMA-801 used for stable certificate IDs.
