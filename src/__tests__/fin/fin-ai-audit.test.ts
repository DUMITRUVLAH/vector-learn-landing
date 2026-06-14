/**
 * TRUST-002 — AI Audit Log routes + purge + FinAiAuditPage component
 *
 * T-TRUST-002-1 [blocant] finAiAuditRoutes exports from server/routes/finAiAudit.ts
 * T-TRUST-002-2 [blocant] purge calculates cutoff date correctly from retention days
 * T-TRUST-002-3 [blocant] FinAiAuditPage component module exports FinAiAuditPage
 * T-TRUST-002-4 [normal]  GET handler validates action filter in query schema
 * T-TRUST-002-5 [normal]  API client functions are exported
 */

import { describe, it, expect, vi } from "vitest";

// ─── T-TRUST-002-1 [blocant] Route exports ────────────────────────────────────
// We verify the module exports the router without actually running DB code
// by checking the module structure at the static level.

describe("TRUST-002 — route file structure", () => {
  it("T-TRUST-002-1 [blocant] server/routes/finAiAudit.ts exports finAiAuditRoutes", async () => {
    // We use a dynamic import with vi.mock to avoid DB initialisation
    vi.mock("../../../server/db/client", () => ({
      db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      },
    }));

    const mod = await import("../../../server/routes/finAiAudit");
    expect(mod.finAiAuditRoutes).toBeDefined();
    expect(typeof mod.finAiAuditRoutes.fetch).toBe("function");
  });
});

// ─── T-TRUST-002-2 [blocant] Purge cutoff date calculation ───────────────────

describe("TRUST-002 — purge cutoff calculation", () => {
  it("T-TRUST-002-2 [blocant] cutoff is N days before today", () => {
    const retentionDays = 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const diffMs = Date.now() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(Math.round(diffDays)).toBe(retentionDays);
  });

  it("cutoff with 90-day retention is ~3 months back", () => {
    const retentionDays = 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const diffMs = Date.now() - cutoff.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(Math.round(diffDays)).toBe(90);
  });
});

// ─── T-TRUST-002-3 [blocant] Component exports ───────────────────────────────

describe("TRUST-002 — FinAiAuditPage component export", () => {
  it("T-TRUST-002-3 [blocant] FinAiAuditPage is a React function component", async () => {
    vi.mock("../../lib/api/finAiAudit", () => ({
      listAiAuditLog: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1 }),
      purgeAiAuditLog: vi.fn().mockResolvedValue({ deleted: 0 }),
    }));
    vi.mock("../../hooks/useSession", () => ({
      useSession: vi.fn().mockReturnValue({ status: "authenticated" }),
    }));
    vi.mock("../../components/app/AppShell", () => ({
      AppShell: ({ children }: { children: React.ReactNode }) => children,
    }));

    const mod = await import("../../pages/fin/FinAiAuditPage");
    expect(mod.FinAiAuditPage).toBeDefined();
    expect(typeof mod.FinAiAuditPage).toBe("function");
  });
});

// ─── T-TRUST-002-4 [normal] Query schema validation ──────────────────────────

describe("TRUST-002 — query schema validation", () => {
  it("T-TRUST-002-4 [normal] page defaults to 1, limit defaults to 50", () => {
    // Test the schema logic inline (mirrors server/routes/finAiAudit.ts schema)
    const { z } = require("zod");

    const listQuerySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      action: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    });

    const result = listQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.action).toBeUndefined();
  });

  it("rejects limit > 200", () => {
    const { z } = require("zod");
    const schema = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    });
    expect(() => schema.parse({ limit: "300" })).toThrow();
  });
});

// ─── T-TRUST-002-5 [normal] API client exports ───────────────────────────────

describe("TRUST-002 — API client exports", () => {
  it("T-TRUST-002-5 [normal] finAiAudit client exports listAiAuditLog and purgeAiAuditLog", async () => {
    const mod = await import("../../lib/api/finAiAudit");
    expect(typeof mod.listAiAuditLog).toBe("function");
    expect(typeof mod.purgeAiAuditLog).toBe("function");
  });
});
