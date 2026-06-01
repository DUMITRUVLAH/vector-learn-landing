# DIPLOMA-804 Review — bulk-zip

**Cycle 1 — APPROVED**

## Design system compliance
- All tokens semantic. Bulk ZIP button uses `border-primary text-primary` (outlined style) to
  differentiate from primary download action. Checkboxes use `accent-primary`.
- Progress display in button: "Se generează N/M..." — no hardcoded colors.
- `PackageOpen` icon for ZIP action (semantically correct).
- `role="alert"` on error paragraph.
- Multi-select list has `aria-label` on each checkbox. Select all/deselect all have `aria-label`.

## Integration
- `issueCertificatesBulk` → `POST /api/certificates/issue-bulk` (DIPLOMA-803 route) — single
  round-trip for all participants, deduped on certificateId server-side.
- `generateBulkZip` → loops `generateCertificatePdf` per participant, packs with JSZip.
- Token map built from bulk response: `tokenMap.get(certId)` — no extra API calls.
- `downloadBlob` called once with the ZIP blob.

## Adversarial
- Tenant-safe: `issueCertificatesBulk` uses `requireAuth` → tenantId from session.
- Progress callback doesn't throw on error — `generatingBulk` reset in `finally`.
- Deselected participants excluded before API call — no wasted requests.

## Tests
- T-DIPLOMA-804-1: 3 participants, 3 tokens, dedup — PASS
- T-DIPLOMA-804-2: buildCertificateFileName strips /: → PASS
- T-DIPLOMA-804-3: deselect 1 of 3 → 2 selected — PASS

**Verdict: APPROVED**
