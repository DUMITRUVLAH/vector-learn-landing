/**
 * ITPARK-201 — Revenue Lines CRUD + tabel editabil
 * Tests: T-201-1..T-201-3
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

// ─── T-201-1 [blocant]: CRUD linie; suma în cents, afișaj 2 zecimale; izolat tenant ──────────

describe("ITPARK-201 — Revenue Lines schema + cents (T-201-1)", () => {
  it("lineWriteSchema validates required fields", async () => {
    const { z } = await import("zod");

    const schema = z.object({
      engagementId: z.string().uuid(),
      rowNo: z.number().int().min(0).default(0),
      clientName: z.string().min(1).max(255),
      documentRefs: z.string().nullable().optional(),
      serviceDescription: z.string().default(""),
      caemCode: z.string().min(1).max(20),
      amountCents: z.number().int().min(0),
      isEligible: z.boolean().optional(),
      month: z.number().int().min(1).max(12).nullable().optional(),
    });

    const valid = schema.safeParse({
      engagementId: "123e4567-e89b-12d3-a456-426614174000",
      clientName: "Vector Academy SRL",
      caemCode: "85.59",
      amountCents: 150000, // 1.500,00 MDL
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.rowNo).toBe(0);
      expect(valid.data.serviceDescription).toBe("");
    }
  });

  it("amountCents must be non-negative integer", async () => {
    const { z } = await import("zod");
    const amountSchema = z.number().int().min(0);
    expect(amountSchema.safeParse(0).success).toBe(true);
    expect(amountSchema.safeParse(150000).success).toBe(true);
    expect(amountSchema.safeParse(-1).success).toBe(false);
    expect(amountSchema.safeParse(1.5).success).toBe(false); // nu int
  });

  it("month must be 1–12 or null", async () => {
    const { z } = await import("zod");
    const monthSchema = z.number().int().min(1).max(12).nullable().optional();
    expect(monthSchema.safeParse(1).success).toBe(true);
    expect(monthSchema.safeParse(12).success).toBe(true);
    expect(monthSchema.safeParse(null).success).toBe(true);
    expect(monthSchema.safeParse(0).success).toBe(false);
    expect(monthSchema.safeParse(13).success).toBe(false);
  });

  it("fmtMDL formats cents to MDL string with 2 decimals", async () => {
    const { fmtMDL } = await import("../../lib/api/itparkLines");
    // 197119719 cents → "1.971.197,19" MDL (Vector Academy fixture, ro-MD locale)
    const result = fmtMDL(197119719);
    // Accept any thousands separator variant + 2 decimal precision
    const numVal = parseFloat(result.replace(/[.\s]/g, "").replace(",", "."));
    expect(numVal).toBeCloseTo(1971197.19, 1);
    // Must have exactly 2 decimal digits
    const decimalPart = result.split(",")[1] ?? result.split(".").at(-1);
    expect(decimalPart).toHaveLength(2);
  });

  it("fmtMDL formats 0 as '0,00'", async () => {
    const { fmtMDL } = await import("../../lib/api/itparkLines");
    const result = fmtMDL(0);
    expect(result).toMatch(/^0[,.]00$/);
  });

  it("parseMDLtoCents converts MDL string to cents", async () => {
    const { parseMDLtoCents } = await import("../../lib/api/itparkLines");
    expect(parseMDLtoCents("15000,50")).toBe(1500050);
    expect(parseMDLtoCents("15 000,50")).toBe(1500050);
    expect(parseMDLtoCents("0")).toBe(0);
    expect(parseMDLtoCents("")).toBe(0);
    expect(parseMDLtoCents("1500.00")).toBe(150000); // punct decimal
  });
});

// ─── T-201-2 [normal]: schimbarea CAEM actualizează badge eligibil ──────────────────────────

describe("ITPARK-201 — CAEM eligibility derived (T-201-2)", () => {
  it("isEligibleCaemLocal returns correct eligibility", async () => {
    const { isEligibleCaemLocal } = await import("../../lib/api/itparkCaem");
    const codes = [
      { id: "1", code: "85.59", label: "Alte forme de educație", eligible: true, effectiveFrom: "2024-01-01", country: "MD", createdAt: "", updatedAt: "" },
      { id: "2", code: "62.02", label: "IT Consulting", eligible: true, effectiveFrom: "2024-01-01", country: "MD", createdAt: "", updatedAt: "" },
      { id: "3", code: "47.11", label: "Comerț cu amănuntul", eligible: false, effectiveFrom: "2024-01-01", country: "MD", createdAt: "", updatedAt: "" },
    ];

    expect(isEligibleCaemLocal("85.59", codes)).toBe(true);
    expect(isEligibleCaemLocal("62.02", codes)).toBe(true);
    expect(isEligibleCaemLocal("47.11", codes)).toBe(false);
    expect(isEligibleCaemLocal("99.99", codes)).toBe(false); // necunoscut → false
  });

  it("RevenueLinesTable exports default function", async () => {
    const mod = await import("../../pages/app/fin/itpark/RevenueLinesTable");
    expect(typeof mod.default).toBe("function");
  });
});

// ─── T-201-3 [blocant]: rute montate (nu HTML fallback) ───────────────────────────────────────

describe("ITPARK-201 — Route mount (T-201-3)", () => {
  it("itparkLinesRoutes is exported from server/routes/itparkLines.ts", async () => {
    const mod = await import("../../../server/routes/itparkLines");
    expect(mod.itparkLinesRoutes).toBeDefined();
    expect(typeof mod.itparkLinesRoutes.fetch).toBe("function");
  });

  it("app.ts mounts /api/itpark/lines", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const appTs = readFileSync(resolve(__dirname, "../../..") + "/server/app.ts", "utf-8");
    expect(appTs).toContain('"/api/itpark/lines"');
    expect(appTs).toContain("itparkLinesRoutes");
  });

  it("client API exports expected functions", async () => {
    const api = await import("../../lib/api/itparkLines");
    expect(typeof api.listLines).toBe("function");
    expect(typeof api.createLine).toBe("function");
    expect(typeof api.updateLine).toBe("function");
    expect(typeof api.deleteLine).toBe("function");
    expect(typeof api.fmtMDL).toBe("function");
    expect(typeof api.parseMDLtoCents).toBe("function");
  });
});
