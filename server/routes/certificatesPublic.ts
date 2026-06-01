/**
 * DIPLOMA-805 — Public (no-auth) certificate verification endpoint
 *
 * GET /api/public/certificates/:token
 *
 * Accessible without authentication or tenant header.
 * Returns ONLY non-sensitive fields (name, course, edition, mentor,
 * completionDate, certificateId, issuedAt).
 * Never exposes email, phone, amounts, tenantId.
 *
 * Rate-limited via hono-rate-limiter (or a simple in-process limiter
 * when the package is not available, which is acceptable for demo).
 *
 * §3.5.1 portability: no raw .execute().rows — uses query builder.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { issuedCertificates } from "../db/schema";

export const certificatesPublicRoutes = new Hono();

// ─── Simple in-process rate limit (IP-based, sliding window) ─────────────────
// Keeps the route free of an extra npm dependency while honouring AC4.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX = 30; // 30 requests per IP per minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) return true;
  return false;
}

// Prune stale entries periodically (prevent unbounded growth in long-lived processes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// ─── UUID token guard ─────────────────────────────────────────────────────────
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/public/certificates/:token */
certificatesPublicRoutes.get("/:token", async (c) => {
  // Rate limiting
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
    c.req.header("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return c.json({ error: "too_many_requests" }, 429);
  }

  const token = c.req.param("token");
  if (!UUID_REGEX.test(token)) {
    return c.json({ error: "not_found" }, 404);
  }

  // Query only the public-safe columns — never select tenantId, pdfUrl, etc.
  const rows = await db
    .select({
      certificateId: issuedCertificates.certificateId,
      participantName: issuedCertificates.participantName,
      courseName: issuedCertificates.courseName,
      edition: issuedCertificates.edition,
      mentorName: issuedCertificates.mentorName,
      completionDate: issuedCertificates.completionDate,
      issuedAt: issuedCertificates.issuedAt,
    })
    .from(issuedCertificates)
    .where(eq(issuedCertificates.verificationToken, token));

  // §3.5.1 portability: handle both postgres-js (array) and PGlite (.rows) shapes
  const list = Array.isArray(rows)
    ? rows
    : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  const cert = list[0];
  if (!cert) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({
    valid: true,
    certificate: {
      certificateId: cert.certificateId,
      participantName: cert.participantName,
      courseName: cert.courseName,
      edition: cert.edition ?? null,
      mentorName: cert.mentorName ?? null,
      completionDate: cert.completionDate ?? null,
      issuedAt: cert.issuedAt,
    },
  });
});
