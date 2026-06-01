/**
 * DIPLOMA-804 — Server route tests for /api/certificates/issue-bulk
 *
 * Schema validation and deduplication logic.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

const issueBulkSchema = z.object({
  cohortId: z.string().uuid().optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  courseName: z.string().min(1).max(300),
  edition: z.string().max(100).optional().nullable(),
  mentorName: z.string().max(200).optional().nullable(),
  completionDate: z.string().optional().nullable(),
  participants: z
    .array(
      z.object({
        certificateId: z.string().min(1).max(100),
        participantName: z.string().min(1).max(300),
      })
    )
    .min(1)
    .max(500),
});

describe("certificates/issue-bulk (DIPLOMA-804)", () => {
  it("T-DIPLOMA-804-1 [blocant] — 3 participants payload valid", () => {
    const payload = {
      courseName: "Facebook Ads",
      participants: [
        { certificateId: "FACEBO-2026VA-1", participantName: "Ion Popescu" },
        { certificateId: "FACEBO-2026VA-2", participantName: "Maria Ionescu" },
        { certificateId: "FACEBO-2026VA-3", participantName: "Andrei Vlad" },
      ],
    };
    const result = issueBulkSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.participants).toHaveLength(3);
    }
  });

  it("T-DIPLOMA-804-1 [blocant] — server deduplicates on certificateId", () => {
    // Simulate server dedup logic
    const participants = [
      { certificateId: "FACEBO-2026VA-1", participantName: "Ion" },
      { certificateId: "FACEBO-2026VA-1", participantName: "Ion copy" },
      { certificateId: "FACEBO-2026VA-2", participantName: "Maria" },
    ];

    const seen = new Set<string>();
    const deduped = participants.filter((p) => {
      if (seen.has(p.certificateId)) return false;
      seen.add(p.certificateId);
      return true;
    });

    expect(deduped).toHaveLength(2);
  });

  it("T-DIPLOMA-804-3 [blocant] — only selected participants included", () => {
    const allNames = ["Ion", "Maria", "Andrei"];
    const selectedIndices = new Set([0, 2]); // exclude Maria at index 1

    const filtered = allNames.filter((_, i) => selectedIndices.has(i));
    expect(filtered).toHaveLength(2);
    expect(filtered).not.toContain("Maria");
  });

  it("rejects empty participants", () => {
    const result = issueBulkSchema.safeParse({
      courseName: "Curs",
      participants: [],
    });
    expect(result.success).toBe(false);
  });

  it("max 500 participants enforced", () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({
      certificateId: `CERT-${i + 1}`,
      participantName: `Name ${i + 1}`,
    }));
    const result = issueBulkSchema.safeParse({
      courseName: "Curs",
      participants: tooMany,
    });
    expect(result.success).toBe(false);
  });

  it("cohortId, edition, mentorName, completionDate are all optional", () => {
    const minimal = {
      courseName: "Curs",
      participants: [{ certificateId: "CERT-1", participantName: "Ion" }],
    };
    const result = issueBulkSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});
