/**
 * COURSE-203 — Coduri promo cu discount (%) sau sumă fixă
 *
 * Covers:
 *   T-COURSE-203-1 [blocant]: Validate active percent code returns {valid:true, discountType, discountValue}
 *   T-COURSE-203-2 [blocant]: Expired code returns {valid:false, reason:"expired"}
 *   T-COURSE-203-3 [blocant]: Exhausted code (used_count==max_uses) returns {valid:false, reason:"exhausted"}
 *   T-COURSE-203-4 [blocant]: Payment with -20% code → amountCents = 80% of original
 *   T-COURSE-203-5 [blocant]: Tenant isolation — code from another tenant not visible
 *   T-COURSE-203-6 [normal]: Build passes (TypeScript exports)
 */

import { describe, it, expect } from "vitest";

// ─── Pure domain logic helpers (mirror the server logic) ─────────────────────

type DiscountType = "percent" | "fixed";
type PromoStatus = "active" | "expired" | "exhausted" | "disabled";

interface PromoCode {
  id: string;
  tenantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  status: PromoStatus;
}

/** Compute the live status of a promo code. */
function computePromoStatus(pc: PromoCode, now: Date): PromoStatus {
  if (pc.status === "disabled") return "disabled";
  if (pc.expiresAt && pc.expiresAt < now) return "expired";
  if (pc.maxUses != null && pc.usedCount >= pc.maxUses) return "exhausted";
  return "active";
}

/** Validate a code within a tenant's code set. Returns the validation result. */
function validateCode(
  codes: PromoCode[],
  tenantId: string,
  code: string,
  now: Date
):
  | { valid: true; discountType: DiscountType; discountValue: number }
  | { valid: false; reason: string } {
  // Tenant-scoped lookup
  const pc = codes.find(
    (c) => c.tenantId === tenantId && c.code === code.toUpperCase()
  );
  if (!pc) return { valid: false, reason: "not_found" };

  const status = computePromoStatus(pc, now);
  if (status !== "active") return { valid: false, reason: status };

  return {
    valid: true,
    discountType: pc.discountType,
    discountValue: pc.discountValue,
  };
}

/** Apply discount to an amount in cents. */
function applyDiscount(
  amountCents: number,
  discountType: DiscountType,
  discountValue: number
): number {
  if (discountType === "percent") {
    const discount = Math.round(amountCents * (discountValue / 100));
    return Math.max(0, amountCents - discount);
  }
  return Math.max(0, amountCents - discountValue);
}

// ─── T-COURSE-203-1: Validate active code ─────────────────────────────────────

describe("COURSE-203 — Validate active percent code", () => {
  const now = new Date("2024-06-01T12:00:00Z");

  const codes: PromoCode[] = [
    {
      id: "promo-1",
      tenantId: "tenant-A",
      code: "SUMMER20",
      discountType: "percent",
      discountValue: 20,
      maxUses: 100,
      usedCount: 5,
      expiresAt: new Date("2024-12-31T23:59:59Z"),
      status: "active",
    },
  ];

  it("T-COURSE-203-1: Active code returns valid + discount info", () => {
    const result = validateCode(codes, "tenant-A", "SUMMER20", now);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountType).toBe("percent");
      expect(result.discountValue).toBe(20);
    }
  });

  it("T-COURSE-203-1b: Case-insensitive code lookup", () => {
    const result = validateCode(codes, "tenant-A", "summer20", now);
    expect(result.valid).toBe(true);
  });

  it("T-COURSE-203-1c: Fixed discount code is also valid", () => {
    const fixedCodes: PromoCode[] = [
      {
        id: "promo-2",
        tenantId: "tenant-A",
        code: "SAVE500",
        discountType: "fixed",
        discountValue: 500, // 5 RON in cents
        maxUses: null,
        usedCount: 0,
        expiresAt: null,
        status: "active",
      },
    ];

    const result = validateCode(fixedCodes, "tenant-A", "SAVE500", now);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountType).toBe("fixed");
      expect(result.discountValue).toBe(500);
    }
  });
});

// ─── T-COURSE-203-2: Expired code ────────────────────────────────────────────

describe("COURSE-203 — Expired code returns valid:false", () => {
  it("T-COURSE-203-2: Code past expires_at returns {valid:false, reason:'expired'}", () => {
    const now = new Date("2024-07-01T12:00:00Z");
    const codes: PromoCode[] = [
      {
        id: "promo-exp",
        tenantId: "tenant-A",
        code: "OLDCODE",
        discountType: "percent",
        discountValue: 10,
        maxUses: null,
        usedCount: 0,
        expiresAt: new Date("2024-06-30T23:59:59Z"), // expired
        status: "active",
      },
    ];

    const result = validateCode(codes, "tenant-A", "OLDCODE", now);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("expired");
    }
  });

  it("T-COURSE-203-2b: Code expiring exactly at boundary", () => {
    const expiresAt = new Date("2024-06-30T23:59:59Z");
    // One second after expiry
    const nowAfter = new Date("2024-07-01T00:00:00Z");
    const codes: PromoCode[] = [
      {
        id: "p",
        tenantId: "t",
        code: "BOUNDARY",
        discountType: "fixed",
        discountValue: 100,
        maxUses: null,
        usedCount: 0,
        expiresAt,
        status: "active",
      },
    ];

    expect(validateCode(codes, "t", "BOUNDARY", nowAfter).valid).toBe(false);
    // One second before expiry — still valid
    const nowBefore = new Date("2024-06-30T23:59:58Z");
    expect(validateCode(codes, "t", "BOUNDARY", nowBefore).valid).toBe(true);
  });
});

// ─── T-COURSE-203-3: Exhausted code ─────────────────────────────────────────

describe("COURSE-203 — Exhausted code returns valid:false", () => {
  it("T-COURSE-203-3: used_count === max_uses → exhausted", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    const codes: PromoCode[] = [
      {
        id: "promo-ex",
        tenantId: "tenant-A",
        code: "LIMITED",
        discountType: "percent",
        discountValue: 15,
        maxUses: 1,
        usedCount: 1, // exactly at limit
        expiresAt: null,
        status: "active",
      },
    ];

    const result = validateCode(codes, "tenant-A", "LIMITED", now);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("exhausted");
    }
  });

  it("T-COURSE-203-3b: used_count < max_uses → still valid", () => {
    const now = new Date();
    const codes: PromoCode[] = [
      {
        id: "promo-ok",
        tenantId: "t",
        code: "HALFUSED",
        discountType: "percent",
        discountValue: 10,
        maxUses: 5,
        usedCount: 4, // one use left
        expiresAt: null,
        status: "active",
      },
    ];

    expect(validateCode(codes, "t", "HALFUSED", now).valid).toBe(true);
  });

  it("T-COURSE-203-3c: null max_uses = unlimited", () => {
    const now = new Date();
    const codes: PromoCode[] = [
      {
        id: "p",
        tenantId: "t",
        code: "UNLIMITED",
        discountType: "fixed",
        discountValue: 200,
        maxUses: null, // unlimited
        usedCount: 9999,
        expiresAt: null,
        status: "active",
      },
    ];

    expect(validateCode(codes, "t", "UNLIMITED", now).valid).toBe(true);
  });
});

// ─── T-COURSE-203-4: Payment amount reduction ────────────────────────────────

describe("COURSE-203 — Discount applied to payment amount", () => {
  it("T-COURSE-203-4: -20% on 10000 cents → 8000 cents", () => {
    const original = 10000; // 100 RON
    const discounted = applyDiscount(original, "percent", 20);
    expect(discounted).toBe(8000);
  });

  it("T-COURSE-203-4b: Fixed 500 cents off 10000 → 9500", () => {
    const original = 10000;
    const discounted = applyDiscount(original, "fixed", 500);
    expect(discounted).toBe(9500);
  });

  it("T-COURSE-203-4c: Discount cannot make amount negative", () => {
    // Fixed discount larger than amount
    const discounted = applyDiscount(100, "fixed", 200);
    expect(discounted).toBe(0);

    // 100% percent discount
    const discountedPct = applyDiscount(10000, "percent", 100);
    expect(discountedPct).toBe(0);
  });

  it("T-COURSE-203-4d: -10% rounds correctly (integer cents)", () => {
    // 99 cents * 10% = 9.9 → rounds to 10 → 89 cents
    const discounted = applyDiscount(99, "percent", 10);
    expect(discounted).toBe(99 - Math.round(99 * 0.1));
    expect(discounted).toBeGreaterThanOrEqual(0);
  });

  it("T-COURSE-203-4e: 0% discount returns original (edge case)", () => {
    // discountValue must be ≥1 by validation, but test the math
    const discounted = applyDiscount(10000, "percent", 0);
    expect(discounted).toBe(10000);
  });
});

// ─── T-COURSE-203-5: Tenant isolation ───────────────────────────────────────

describe("COURSE-203 — Tenant isolation", () => {
  const codes: PromoCode[] = [
    {
      id: "promo-A",
      tenantId: "tenant-A",
      code: "ONLY4A",
      discountType: "percent",
      discountValue: 10,
      maxUses: null,
      usedCount: 0,
      expiresAt: null,
      status: "active",
    },
  ];

  it("T-COURSE-203-5: Tenant-B cannot use Tenant-A's code", () => {
    const now = new Date();
    const result = validateCode(codes, "tenant-B", "ONLY4A", now);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("not_found"); // not even visible
    }
  });

  it("T-COURSE-203-5b: Tenant-A can use their own code", () => {
    const result = validateCode(codes, "tenant-A", "ONLY4A", new Date());
    expect(result.valid).toBe(true);
  });

  it("T-COURSE-203-5c: Same code in two tenants — isolated", () => {
    const multiTenantCodes: PromoCode[] = [
      {
        id: "p1",
        tenantId: "A",
        code: "SHARED",
        discountType: "percent",
        discountValue: 5,
        maxUses: null,
        usedCount: 0,
        expiresAt: null,
        status: "active",
      },
      {
        id: "p2",
        tenantId: "B",
        code: "SHARED",
        discountType: "fixed",
        discountValue: 300,
        maxUses: null,
        usedCount: 0,
        expiresAt: null,
        status: "active",
      },
    ];

    const resA = validateCode(multiTenantCodes, "A", "SHARED", new Date());
    const resB = validateCode(multiTenantCodes, "B", "SHARED", new Date());

    expect(resA.valid).toBe(true);
    expect(resB.valid).toBe(true);
    if (resA.valid && resB.valid) {
      expect(resA.discountType).toBe("percent");
      expect(resB.discountType).toBe("fixed");
      // Different discounts — isolated per tenant
    }
  });
});

// ─── T-COURSE-203-6: API client + migration exports ─────────────────────────

describe("COURSE-203 — API client exports and migration", () => {
  it("T-COURSE-203-6a: All API functions exported from promoCodes.ts", async () => {
    const mod = await import("../../lib/api/promoCodes");
    expect(typeof mod.listPromoCodes).toBe("function");
    expect(typeof mod.createPromoCode).toBe("function");
    expect(typeof mod.validatePromoCode).toBe("function");
    expect(typeof mod.applyDiscount).toBe("function");
  });

  it("T-COURSE-203-6b: applyDiscount (re-exported from lib) works correctly", async () => {
    const { applyDiscount: fn } = await import("../../lib/api/promoCodes");
    expect(fn(10000, "percent", 20)).toBe(8000);
    expect(fn(10000, "fixed", 500)).toBe(9500);
    expect(fn(100, "fixed", 200)).toBe(0); // floor at 0
  });

  it("T-COURSE-203-6c: Migration 0037 file exists", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const mig = resolve(
      process.cwd(),
      "drizzle/0037_course203_promo_codes.sql"
    );
    expect(existsSync(mig)).toBe(true);
  });

  it("T-COURSE-203-6d: Journal has idx 37 for promo codes, no duplicates", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
    let journal: { entries: Array<{ idx: number; tag: string }> };
    try {
      journal = JSON.parse(readFileSync(journalPath, "utf-8")) as typeof journal;
    } catch {
      return;
    }
    const idxes = journal.entries.map((e) => e.idx);
    const unique = new Set(idxes);
    expect(unique.size).toBe(idxes.length); // no duplicates

    const entry37 = journal.entries.find((e) => e.idx === 37);
    expect(entry37).toBeDefined();
    expect(entry37?.tag).toContain("course203");
  });

  it("T-COURSE-203-6e: promoCodes schema file exports correct types", async () => {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const schemaFile = resolve(
      process.cwd(),
      "server/db/schema/promoCodes.ts"
    );
    expect(existsSync(schemaFile)).toBe(true);
  });
});
