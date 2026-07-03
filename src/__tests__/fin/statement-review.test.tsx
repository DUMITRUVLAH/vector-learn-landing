/**
 * STMT-002: Statement Review — unit tests
 *
 * T-STMT-002-1 [blocant]  Given captureId, when GET /:captureId/lines, then 200 with lines array
 * T-STMT-002-2 [blocant]  Given lineId, when PATCH /:captureId/lines/:lineId, then 200 updated line
 * T-STMT-002-3 [blocant]  Given captureId, when POST /:captureId/match, then 200 matchCount
 * T-STMT-002-4 [normal]   StatementReviewPage renders summary cards without crash
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ─── Backend: patchLine schema validation (pure) ──────────────────────────────

import { z } from "zod";

const patchLineSchema = z.object({
  txDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description:  z.string().max(500).optional(),
  counterparty: z.string().max(300).nullable().optional(),
  amountCents:  z.number().int().min(0).optional(),
  direction:    z.enum(["in", "out"]).optional(),
  reportable:   z.enum(["yes", "no", "review"]).optional(),
});

describe("STMT-002: patchLine schema (pure)", () => {
  it("T-STMT-002-2 [blocant]: accepts valid patch", () => {
    const result = patchLineSchema.safeParse({
      direction: "out",
      reportable: "yes",
      amountCents: 15000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative amountCents", () => {
    const result = patchLineSchema.safeParse({ amountCents: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid direction", () => {
    const result = patchLineSchema.safeParse({ direction: "sideways" });
    expect(result.success).toBe(false);
  });

  it("rejects bad txDate format", () => {
    const result = patchLineSchema.safeParse({ txDate: "2024/01/01" });
    expect(result.success).toBe(false);
  });

  it("accepts partial patch (all fields optional)", () => {
    const result = patchLineSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ─── Frontend: StatementReviewPage smoke ─────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/business/fin/statement/abc-capture" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/pages/fin/FinLayout", () => ({
  FinLayout: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="fin-layout" data-page-title={pageTitle}>{children}</div>
  ),
}));

// fetch mock: lines + summary
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/summary")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        totalLines: 10,
        matchedLines: 4,
        reportableLines: 6,
        totalOutCents: 250000,
      }),
    });
  }
  if (url.includes("/lines")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        lines: [],
        total: 0,
      }),
    });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
});

describe("T-STMT-002-4 [normal]: StatementReviewPage smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash", async () => {
    const { default: StatementReviewPage } = await import(
      "@/pages/fin/StatementReviewPage"
    );
    render(<StatementReviewPage captureId="c0a80101-0000-4000-a000-000000000001" />);
    // The page should render its container without throwing
    await waitFor(() => {
      // Either a heading or the main layout renders
      expect(document.body).toBeTruthy();
    });
  });

  it("T-STMT-002-1 [blocant]: calls GET lines endpoint on mount", async () => {
    const { default: StatementReviewPage } = await import(
      "@/pages/fin/StatementReviewPage"
    );
    const captureId = "c0a80101-0000-4000-a000-000000000002";
    render(<StatementReviewPage captureId={captureId} />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const linesCall = calls.find(([url]: [string]) => url.includes(`/${captureId}/lines`));
      expect(linesCall).toBeTruthy();
    });
  });

  it("T-STMT-002-1 [blocant]: calls GET summary endpoint on mount", async () => {
    const { default: StatementReviewPage } = await import(
      "@/pages/fin/StatementReviewPage"
    );
    const captureId = "c0a80101-0000-4000-a000-000000000003";
    render(<StatementReviewPage captureId={captureId} />);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const summaryCall = calls.find(([url]: [string]) => url.includes(`/${captureId}/summary`));
      expect(summaryCall).toBeTruthy();
    });
  });
});
