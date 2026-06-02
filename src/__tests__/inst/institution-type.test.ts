/**
 * INST-001 — institution type: module-visibility logic + route schema.
 *
 * Pure-function coverage for the rule that drives the whole feature: which
 * module groups (sidebar + dashboard) a workspace sees for each type.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { isModuleVisible, institutionLabel, INSTITUTION_TYPES } from "@/lib/institution";

// Mirrors the zod schema in server/routes/institution.ts (kept here for isolation).
const institutionTypeSchema = z.object({
  institutionType: z.enum(["gradinita", "scoala", "mixt"]),
});

describe("isModuleVisible (INST-001)", () => {
  it("[blocant] shared modules are always visible, for every type", () => {
    for (const t of ["gradinita", "scoala", "mixt", undefined] as const) {
      expect(isModuleVisible("shared", t)).toBe(true);
    }
  });

  it("[blocant] mixt sees both school and kindergarten modules", () => {
    expect(isModuleVisible("scoala", "mixt")).toBe(true);
    expect(isModuleVisible("gradinita", "mixt")).toBe(true);
  });

  it("[blocant] a gradinita hides school modules and shows kindergarten", () => {
    expect(isModuleVisible("scoala", "gradinita")).toBe(false);
    expect(isModuleVisible("gradinita", "gradinita")).toBe(true);
  });

  it("[blocant] a scoala hides kindergarten modules and shows school", () => {
    expect(isModuleVisible("gradinita", "scoala")).toBe(false);
    expect(isModuleVisible("scoala", "scoala")).toBe(true);
  });

  it("undefined type (older session) behaves like mixt — see everything", () => {
    expect(isModuleVisible("scoala", undefined)).toBe(true);
    expect(isModuleVisible("gradinita", undefined)).toBe(true);
  });
});

describe("institutionLabel (INST-001)", () => {
  it("returns a human label for each type and falls back to Mixt", () => {
    expect(institutionLabel("gradinita")).toMatch(/Grădiniță/);
    expect(institutionLabel("scoala")).toMatch(/Școală/);
    expect(institutionLabel("mixt")).toMatch(/Mixt/);
    expect(institutionLabel(undefined)).toMatch(/Mixt/);
  });

  it("exposes exactly the 3 selectable types", () => {
    expect(INSTITUTION_TYPES.map((x) => x.value)).toEqual(["gradinita", "scoala", "mixt"]);
  });
});

describe("institution route schema (INST-001)", () => {
  it("[blocant] accepts the 3 valid types", () => {
    for (const t of ["gradinita", "scoala", "mixt"]) {
      expect(institutionTypeSchema.safeParse({ institutionType: t }).success).toBe(true);
    }
  });

  it("[blocant] rejects unknown / missing values", () => {
    expect(institutionTypeSchema.safeParse({ institutionType: "liceu" }).success).toBe(false);
    expect(institutionTypeSchema.safeParse({}).success).toBe(false);
  });
});
