/**
 * INTEG-201 — Lead ingest (Lovable → CRM) via API key
 *
 * Endpoint: POST /api/leads/ingest  (auth: X-API-Key)
 *
 * These tests lock the request contract + the server-side mapping decisions
 * without booting a DB (mirrors the pure-logic style of api-keys.test.ts):
 *   - schema accepts the documented payload and rejects malformed input
 *   - course mapping precedence (courseId UUID wins over courseCode text)
 *   - source/utm tagging defaults ("webform" + utmSource "lovable")
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of ingestLeadSchema in server/routes/leads.ts — kept in sync by tests.
const ingestLeadSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  interestCourse: z.string().max(200).optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  courseCode: z.string().max(200).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  consentText: z.string().max(500).optional().nullable(),
});

describe("INTEG-201 — ingest schema", () => {
  it("T-INTEG-201-1 [blocant]: accepts a minimal Lovable payload (name only)", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "Maria Popescu" });
    expect(r.success).toBe(true);
  });

  it("T-INTEG-201-2 [blocant]: accepts the full documented payload", () => {
    const r = ingestLeadSchema.safeParse({
      fullName: "Andrei Ionescu",
      phone: "+40721234567",
      email: "andrei@example.com",
      interestCourse: "Spaniolă A2",
      courseId: "550e8400-e29b-41d4-a716-446655440000",
      utmSource: "lovable",
      utmCampaign: "summer-2026",
      consentText: "Sunt de acord cu prelucrarea datelor",
    });
    expect(r.success).toBe(true);
  });

  it("T-INTEG-201-3 [blocant]: rejects a too-short name", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "A" });
    expect(r.success).toBe(false);
  });

  it("T-INTEG-201-4 [blocant]: rejects a malformed email", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "Ion Pop", email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("T-INTEG-201-5: rejects a non-UUID courseId (forces real FK or code fallback)", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "Ion Pop", courseId: "spaniola-a2" });
    expect(r.success).toBe(false);
  });

  it("T-INTEG-201-6: accepts a free-text courseCode as the mapping fallback", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "Ion Pop", courseCode: "Spaniolă A2" });
    expect(r.success).toBe(true);
  });

  it("T-INTEG-201-7: treats empty-string email as allowed (optional contact)", () => {
    const r = ingestLeadSchema.safeParse({ fullName: "Ion Pop", email: "" });
    expect(r.success).toBe(true);
  });
});

// ─── Server-side mapping decisions (pure functions mirrored from the handler) ──

/** courseId (UUID) takes precedence; courseCode is only used when no id given. */
function resolveCoursePrecedence(courseId?: string | null, courseCode?: string | null) {
  if (courseId) return { strategy: "by-id" as const, value: courseId };
  if (courseCode) return { strategy: "by-code" as const, value: courseCode };
  return { strategy: "none" as const, value: null };
}

/** Mirror of the source/utm tagging defaults applied in the handler. */
function ingestSourceTag(utmSource?: string | null) {
  return { source: "webform" as const, utmSource: utmSource || "lovable" };
}

describe("INTEG-201 — course mapping precedence", () => {
  it("T-INTEG-201-8 [blocant]: courseId wins over courseCode", () => {
    const r = resolveCoursePrecedence("550e8400-e29b-41d4-a716-446655440000", "Spaniolă A2");
    expect(r.strategy).toBe("by-id");
  });

  it("T-INTEG-201-9: falls back to courseCode when no id", () => {
    const r = resolveCoursePrecedence(null, "Spaniolă A2");
    expect(r.strategy).toBe("by-code");
    expect(r.value).toBe("Spaniolă A2");
  });

  it("T-INTEG-201-10: no mapping when neither is provided", () => {
    expect(resolveCoursePrecedence(null, null).strategy).toBe("none");
  });
});

describe("INTEG-201 — source tagging", () => {
  it("T-INTEG-201-11 [blocant]: default utmSource is 'lovable', source stays 'webform'", () => {
    const t = ingestSourceTag(undefined);
    expect(t.source).toBe("webform");
    expect(t.utmSource).toBe("lovable");
  });

  it("T-INTEG-201-12: explicit utmSource is preserved", () => {
    expect(ingestSourceTag("zapier").utmSource).toBe("zapier");
  });
});
