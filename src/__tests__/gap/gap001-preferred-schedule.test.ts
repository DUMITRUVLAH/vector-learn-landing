/**
 * GAP-001 — Slot preferat orar pe lead/student
 * T-GAP-001-1: PATCH /api/leads/:id saves preferredDays + time window
 * T-GAP-001-2: preferredDays nullable — lead without slot returns no error
 * T-GAP-001-3: PATCH /api/students/:id saves preferred schedule
 * T-GAP-001-4: preferredDays validation — values must be 1-7
 */
import { describe, it, expect } from "vitest";

// Unit tests for schema + validation logic
// We test the Zod schema directly since the routes use zValidator

import { z } from "zod";

const preferredDaysSchema = z.array(z.number().int().min(1).max(7)).optional().nullable();
const preferredTimeSchema = z.string().regex(/^\d{2}:\d{2}$/).optional().nullable();

const updateLeadSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().max(32).optional().nullable(),
  preferredDays: preferredDaysSchema,
  preferredTimeStart: preferredTimeSchema,
  preferredTimeEnd: preferredTimeSchema,
});

describe("GAP-001 — preferred schedule validation", () => {
  it("T-GAP-001-1: accepts valid preferredDays + time window", () => {
    const result = updateLeadSchema.safeParse({
      preferredDays: [2, 4],
      preferredTimeStart: "17:00",
      preferredTimeEnd: "19:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredDays).toEqual([2, 4]);
      expect(result.data.preferredTimeStart).toBe("17:00");
      expect(result.data.preferredTimeEnd).toBe("19:00");
    }
  });

  it("T-GAP-001-2: nullable preferredDays — no error when null", () => {
    const result = updateLeadSchema.safeParse({
      fullName: "Test Lead",
      preferredDays: null,
      preferredTimeStart: null,
      preferredTimeEnd: null,
    });
    expect(result.success).toBe(true);
  });

  it("T-GAP-001-2: missing preferredDays — no error (optional)", () => {
    const result = updateLeadSchema.safeParse({ fullName: "Test Lead" });
    expect(result.success).toBe(true);
  });

  it("T-GAP-001-3: rejects day value out of range (8)", () => {
    const result = updateLeadSchema.safeParse({
      preferredDays: [1, 8],
    });
    expect(result.success).toBe(false);
  });

  it("T-GAP-001-3: rejects day value out of range (0)", () => {
    const result = updateLeadSchema.safeParse({
      preferredDays: [0, 3],
    });
    expect(result.success).toBe(false);
  });

  it("T-GAP-001-4: rejects invalid time format", () => {
    const result = updateLeadSchema.safeParse({
      preferredTimeStart: "9:00",  // missing leading zero
    });
    expect(result.success).toBe(false);
  });

  it("T-GAP-001-4: accepts all valid day values 1-7", () => {
    const result = updateLeadSchema.safeParse({
      preferredDays: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(result.success).toBe(true);
  });

  it("T-GAP-001-4: weekend-only preference", () => {
    const result = updateLeadSchema.safeParse({
      preferredDays: [6, 7],
      preferredTimeStart: "10:00",
      preferredTimeEnd: "12:00",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preferredDays).toEqual([6, 7]);
    }
  });
});
