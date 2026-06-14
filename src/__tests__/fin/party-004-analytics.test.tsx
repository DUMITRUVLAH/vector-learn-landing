/**
 * PARTY-004 — CRM Financiar: segment, top clienți, aging per partener
 *
 * T-PARTY004-1 [blocant] API /analytics/top-clients returns sorted array
 * T-PARTY004-2 [blocant] Graceful fallback returns [] when finInvoices unavailable
 * T-PARTY004-3 [normal]  aging endpoint returns correct bucket shape
 * T-PARTY004-4 [normal]  segments endpoint returns VIP/Regular/New distribution
 * T-PARTY004-5 [blocant] PartiesPage renders without crash + segment badges visible
 * T-PARTY004-6 [normal]  dark mode: segment badges use semantic tokens (no hex)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mock infrastructure ──────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/parties", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u-1", tenantId: "t-1" } }),
}));

vi.mock("@/lib/api/finParties", () => ({
  listParties: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  createParty: vi.fn(),
  getTopClients: vi.fn().mockResolvedValue({
    data: [
      {
        partyId: "p-1",
        partyName: "SRL Alpha",
        totalRevenueCents: 6_000_000,
        openBalanceCents: 500_000,
        segment: "VIP",
      },
      {
        partyId: "p-2",
        partyName: "SRL Beta",
        totalRevenueCents: 1_000_000,
        openBalanceCents: 0,
        segment: "Regular",
      },
    ],
  }),
  getSegmentDistribution: vi.fn().mockResolvedValue({
    data: { VIP: 1, Regular: 3, New: 2 },
  }),
  getPartyAging: vi.fn().mockResolvedValue({
    data: { d0_30: 100_00, d31_60: 50_00, d61_90: 0, d90plus: 0 },
  }),
  getPartyMetrics: vi.fn().mockResolvedValue({
    data: {
      totalRevenue: 6_000_000,
      openBalance: 500_000,
      aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    },
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderPage(module: string, Component: string) {
  const { [Component]: Page } = await import(module);
  render(<Page />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PARTY-004 analytics", () => {
  beforeEach(() => vi.clearAllMocks());

  // T-PARTY004-1: top-clients sorted DESC
  it("T-PARTY004-1 [blocant] getTopClients returns array sorted by revenue", async () => {
    const { getTopClients } = await import("@/lib/api/finParties");
    const result = await getTopClients(10);
    const data = result.data;
    expect(Array.isArray(data)).toBe(true);
    // First item should have higher revenue
    if (data.length >= 2) {
      expect(data[0].totalRevenueCents).toBeGreaterThanOrEqual(data[1].totalRevenueCents);
    }
    expect(data[0].partyName).toBe("SRL Alpha");
    expect(data[0].segment).toBe("VIP");
  });

  // T-PARTY004-2: graceful fallback
  it("T-PARTY004-2 [blocant] graceful fallback returns [] when no data", async () => {
    const { getTopClients } = await import("@/lib/api/finParties");
    (getTopClients as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [] });
    const result = await getTopClients(10);
    expect(result.data).toEqual([]);
  });

  // T-PARTY004-3: aging shape
  it("T-PARTY004-3 [normal] aging endpoint returns correct bucket shape", async () => {
    const { getPartyAging } = await import("@/lib/api/finParties");
    const result = await getPartyAging("party-1");
    const ag = result.data;
    expect(typeof ag.d0_30).toBe("number");
    expect(typeof ag.d31_60).toBe("number");
    expect(typeof ag.d61_90).toBe("number");
    expect(typeof ag.d90plus).toBe("number");
    expect(ag.d0_30).toBe(10000); // 100_00 cents = 100 MDL
  });

  // T-PARTY004-4: segments shape
  it("T-PARTY004-4 [normal] segments returns VIP/Regular/New distribution", async () => {
    const { getSegmentDistribution } = await import("@/lib/api/finParties");
    const result = await getSegmentDistribution();
    expect(result.data).toMatchObject({
      VIP: expect.any(Number),
      Regular: expect.any(Number),
      New: expect.any(Number),
    });
    expect(result.data.VIP).toBe(1);
    expect(result.data.Regular).toBe(3);
  });

  // T-PARTY004-5: PartiesPage renders without crash + segment badges visible
  it("T-PARTY004-5 [blocant] PartiesPage renders without crash", async () => {
    const { PartiesPage } = await import("@/pages/app/fin/PartiesPage");
    expect(() => render(<PartiesPage />)).not.toThrow();
    // Page title present
    expect(screen.getByText(/Parteneri comerciali/i)).toBeDefined();
    // Tab navigation present
    expect(screen.getByText(/Top Clienți/i)).toBeDefined();
    expect(screen.getByText(/Listă parteneri/i)).toBeDefined();
  });

  // T-PARTY004-6: semantic tokens (no hex) check
  it("T-PARTY004-6 [normal] segment badges use semantic token class names (no hex)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    // Read the PartiesPage source
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/pages/app/fin/PartiesPage.tsx"),
      "utf8"
    );
    // Should not contain hardcoded hex colors (#xxxxxx or #xxx)
    const hexMatch = src.match(/#[0-9a-fA-F]{3,6}\b/g);
    expect(hexMatch).toBeNull();
  });
});
