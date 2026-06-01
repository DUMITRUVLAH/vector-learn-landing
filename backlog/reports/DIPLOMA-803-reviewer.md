# DIPLOMA-803 Review — generate-qr

**Cycle 1 — APPROVED**

## Design system compliance
- All UI tokens semantic (no hardcoded hex). Format toggle, participant navigator use `bg-primary`, `border-border`, etc.
- Navigation arrows have `aria-label`. Manual names textarea has `<label htmlFor>`. Download button has `aria-label`.
- Dark mode works via tokens.

## Integration
- `POST /api/certificates/issue` mounted in `server/app.ts` before health endpoint.
- Tenant safety: `user.tenantId` from `requireAuth` — body never supplies tenantId.
- Upsert on `(tenantId, certificateId)` unique constraint — re-issue keeps token.
- No raw `.execute().rows` — all queries use Drizzle query builder with `Array.isArray` guard.
- `issueCertificate` client API correctly POSTs to `/api/certificates/issue`.
- `generateCertificatePdf` uses `jsPDF` A4 landscape (297×210mm) as spec requires.
- QR via `QRCode.toDataURL` with verificationToken in URL `/#/verify/{token}`.

## Adversarial findings (token/mutation + cross-tenant)
- Cross-tenant: user.tenantId enforced at auth layer — cannot issue on another tenant's cohort.
- Token stability: upsert logic returns existing token if row found — no token drift.
- QR URL uses `window.location.origin` + `/#/verify/{token}` — correct hash-router format.

## Tests
- T-DIPLOMA-803-1: valid issue payload passes schema — PASS
- T-DIPLOMA-803-2: re-issue is modelled as upsert — PASS
- T-DIPLOMA-803-3: tenant isolation verified — PASS
- T-DIPLOMA-803-4: paste 3 names → 3 participants — PASS

**Verdict: APPROVED**
