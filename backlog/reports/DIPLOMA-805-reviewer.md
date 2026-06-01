# Code Review — DIPLOMA-805

**Item:** DIPLOMA-805 — Public certificate verification page `/verify/:token`
**Cycle:** 1
**Verdict:** APPROVED

## Design-system compliance
- All semantic tokens used (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `text-success`, `bg-success/15`). No hardcoded hex.
- Dark mode works: all states (loading, valid, invalid) use semantic tokens.
- Mobile-first: `max-w-lg container` with `px-4`, all touch targets appropriate.

## Accessibility
- `role="main"` on valid/invalid state containers.
- `aria-live="polite"` + `aria-busy="true"` on loading state.
- `aria-hidden="true"` on decorative icons.
- `aria-label` on main containers with descriptive text.
- `ShieldCheck` and `ShieldX` icons have aria-hidden (purely decorative).

## Security
- UUID regex guard before DB query (SQL injection protection).
- Only safe fields selected from DB (`certificateId`, `participantName`, `courseName`, `edition`, `mentorName`, `completionDate`, `issuedAt`).
- `tenantId`, `email`, `phone`, `pdfUrl`, `amount` never selected or exposed.
- No auth header required → correctly a public route.
- In-process rate limiter: 30 req/min per IP (AC4 satisfied).
- Public route registered BEFORE `tagRoutes` in `app.ts` (correct ordering pattern, same as `feedbackPublic`).

## DB portability
- Uses `Array.isArray(rows) ? rows : (rows as ...).rows ?? rows` guard (§3.5.1 compliant).
- No raw `db.execute()` calls.

## TypeScript
- `strict: true` compliant; no `any` types.
- All interfaces defined (`CertificateData`, `VerifyState`, `VerifyCertificatePageProps`, `RowProps`).

## Dead code / links
- No dead links; `/verify/:token` correctly registered in `App.tsx`.
- Route cleanup: `setInterval` for stale rate-limit entries prevents memory leak.

## Minor notes
- `verifyCertificatePublic` helper added to `src/lib/api/certificates.ts` for any future consumer.
- `encodeURIComponent(token)` used consistently.

**APPROVED — no changes required.**
