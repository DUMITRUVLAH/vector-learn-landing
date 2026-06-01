# Integration Review — DIPLOMA-805

**Item:** DIPLOMA-805 — Public certificate verification page
**Verdict:** CONNECTED

## Data flow
- `issued_certificates.verificationToken` (UUID, unique, set in DIPLOMA-801 schema) is the lookup key.
- The QR code generated in DIPLOMA-803 encodes `https://<host>/#/verify/<verificationToken>`.
- The frontend `App.tsx` routes `/verify/:token` → `VerifyCertificatePage`, which calls `GET /api/public/certificates/:token`.
- The server route queries `issuedCertificates` by `verificationToken` and returns only public fields.

## Route ordering (critical)
- `app.route("/api/public/certificates", certificatesPublicRoutes)` is registered AFTER `feedbackPublicRoutes` and BEFORE `tagRoutes` in `server/app.ts`.
- This prevents `tagRoutes`' global `requireAuth` from intercepting the public endpoint.

## Module connections
- DIPLOMA-801: `issuedCertificates` table + `verificationToken` column — this is what DIPLOMA-805 queries.
- DIPLOMA-803: certificate issuance creates rows in `issued_certificates` with unique tokens.
- DIPLOMA-804: bulk issue creates multiple rows, all verifiable via this endpoint.
- FEEDBACK-601: same pattern as `feedbackPublic` (public no-auth route before `tagRoutes`).

## Tenant safety
- The public endpoint does NOT filter by `tenantId` — by design. Any valid token is globally verifiable (employer scanning QR does not know the tenant). The response exposes zero tenant-identifying information.
- No cross-tenant data leak: the query selects only non-sensitive fields; the full row (including `tenantId`) is never returned.

## API contract
- `GET /api/public/certificates/:token` → `{ valid: true, certificate: {...} }` | `{ error: "not_found" }` (404) | `{ error: "too_many_requests" }` (429).
- Frontend `VerifyCertificatePage` handles all three states correctly.

**CONNECTED — all module wires in place.**
