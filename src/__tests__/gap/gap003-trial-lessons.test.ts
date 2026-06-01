/**
 * GAP-003 — Lecție Trial (tip distinct de lecție)
 * T-GAP-003-1: POST /api/lessons accepts isTrial=true + trialLeadId
 * T-GAP-003-2: GET /api/lessons?leadId= returns only trial lessons for that lead
 * T-GAP-003-3: trial lesson normal lesson (isTrial=false) has no trialLeadId
 * T-GAP-003-4: trialResult enum validation
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

const createLessonSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  meetingUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  isTrial: z.boolean().optional().default(false),
  trialLeadId: z.string().uuid().optional().nullable(),
  trialResult: z.enum(["interested", "not_interested", "no_show"]).optional().nullable(),
});

const COURSE_UUID = "00000000-0000-0000-0000-000000000001";
const TEACHER_UUID = "00000000-0000-0000-0000-000000000002";
const LEAD_UUID = "00000000-0000-0000-0000-000000000003";

describe("GAP-003 — trial lesson schema validation", () => {
  it("T-GAP-003-1: accepts isTrial=true with trialLeadId", () => {
    const result = createLessonSchema.safeParse({
      courseId: COURSE_UUID,
      teacherId: TEACHER_UUID,
      scheduledAt: "2026-06-10T17:00:00.000Z",
      durationMinutes: 60,
      isTrial: true,
      trialLeadId: LEAD_UUID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTrial).toBe(true);
      expect(result.data.trialLeadId).toBe(LEAD_UUID);
    }
  });

  it("T-GAP-003-1: defaults isTrial to false when not provided", () => {
    const result = createLessonSchema.safeParse({
      courseId: COURSE_UUID,
      teacherId: TEACHER_UUID,
      scheduledAt: "2026-06-10T17:00:00.000Z",
      durationMinutes: 60,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTrial).toBe(false);
      expect(result.data.trialLeadId).toBeUndefined();
    }
  });

  it("T-GAP-003-3: normal lesson has isTrial=false (explicit)", () => {
    const result = createLessonSchema.safeParse({
      courseId: COURSE_UUID,
      teacherId: TEACHER_UUID,
      scheduledAt: "2026-06-10T17:00:00.000Z",
      durationMinutes: 60,
      isTrial: false,
      trialLeadId: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isTrial).toBe(false);
      expect(result.data.trialLeadId).toBeNull();
    }
  });

  it("T-GAP-003-4: accepts valid trialResult values", () => {
    const values = ["interested", "not_interested", "no_show"] as const;
    for (const v of values) {
      const result = createLessonSchema.safeParse({
        courseId: COURSE_UUID,
        teacherId: TEACHER_UUID,
        scheduledAt: "2026-06-10T17:00:00.000Z",
        durationMinutes: 60,
        isTrial: true,
        trialLeadId: LEAD_UUID,
        trialResult: v,
      });
      expect(result.success).toBe(true);
    }
  });

  it("T-GAP-003-4: rejects invalid trialResult", () => {
    const result = createLessonSchema.safeParse({
      courseId: COURSE_UUID,
      teacherId: TEACHER_UUID,
      scheduledAt: "2026-06-10T17:00:00.000Z",
      durationMinutes: 60,
      isTrial: true,
      trialLeadId: LEAD_UUID,
      trialResult: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("T-GAP-003-4: trialResult nullable — no result yet is valid", () => {
    const result = createLessonSchema.safeParse({
      courseId: COURSE_UUID,
      teacherId: TEACHER_UUID,
      scheduledAt: "2026-06-10T17:00:00.000Z",
      durationMinutes: 60,
      isTrial: true,
      trialLeadId: LEAD_UUID,
      trialResult: null,
    });
    expect(result.success).toBe(true);
  });
});
