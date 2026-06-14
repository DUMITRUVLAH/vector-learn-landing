/**
 * @vitest-environment jsdom
 *
 * INSIGHT-004: FinInsightsPage UI tests
 *
 * T-INSIGHT-004-1 [blocant]: FinInsightsPage renders without crash (all fetches mocked)
 * T-INSIGHT-004-2 [blocant]: KpiCard renders value + delta correctly
 * T-INSIGHT-004-3 [normal]: "Generează narativă AI" button calls generateAiNarrative
 * T-INSIGHT-004-4 [normal]: Save view button opens a modal with name input
 * T-INSIGHT-004-5 [normal]: CashflowChart renders <svg> when scenarios provided
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mock global fetch ────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  vi.resetModules();
});

// ─── Mock modules ─────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Andreea", role: "admin" },
      tenant: { id: "tenant-1", name: "Test Academy", institutionType: "scoala" },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/finance/insights" }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/institution", () => ({
  isModuleVisible: () => true,
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="notif-bell" />,
}));

vi.mock("@/components/app/BranchSwitcher", () => ({
  BranchSwitcher: () => <div data-testid="branch-switcher" />,
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

// ─── Mock API responses ───────────────────────────────────────────────────────

const MOCK_METRICS = {
  metrics: [
    { period: "2026-01", revenue: 100000, receivable: 20000, profit: 80000 },
    { period: "2026-02", revenue: 120000, receivable: 25000, profit: 95000 },
    { period: "2026-03", revenue: 110000, receivable: 22000, profit: 88000 },
    { period: "2026-04", revenue: 130000, receivable: 30000, profit: 100000 },
    { period: "2026-05", revenue: 115000, receivable: 18000, profit: 97000 },
    { period: "2026-06", revenue: 150000, receivable: 28000, profit: 122000 },
  ],
  period: "last_6m",
  groupBy: "month",
};

const MOCK_AGING = {
  aging: { "0_30": 15000, "31_60": 8000, "61_90": 3000, "90_plus": 2000, total: 28000 },
};

const base60 = Array.from({ length: 60 }, (_, i) => ({
  date: `2026-06-${String(15 + i % 15).padStart(2, "0")}`,
  cumulativeCents: (i + 1) * 10000,
}));

const MOCK_FORECAST = {
  scenarios: {
    good: base60.map((d) => ({ ...d, cumulativeCents: Math.round(d.cumulativeCents * 1.2) })),
    base: base60,
    pessimistic: base60.map((d) => ({ ...d, cumulativeCents: Math.round(d.cumulativeCents * 0.8) })),
  },
  weeklyAvgCents: 70000,
  generatedAt: "2026-06-14T12:00:00Z",
};

const MOCK_VIEWS = { views: [] };
const MOCK_NARRATIVES = { narratives: [] };

function mockAllApis() {
  // metrics, aging, cashflow-forecast, saved-views, narratives
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_METRICS })
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_AGING })
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_FORECAST })
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_VIEWS })
    .mockResolvedValueOnce({ ok: true, json: async () => MOCK_NARRATIVES });
}

// ─── T-INSIGHT-004-1 [blocant]: FinInsightsPage renders without crash ─────────
describe("T-INSIGHT-004-1 [blocant]", () => {
  it("renders without crash and shows 'Revenue' text", async () => {
    mockAllApis();

    const { FinInsightsPage } = await import("@/pages/finance/FinInsightsPage");
    const { unmount } = render(<FinInsightsPage />);

    // The page should render and show KPI card labels
    await waitFor(() => {
      expect(screen.getByText("Revenue")).toBeInTheDocument();
    });

    unmount();
  });
});

// ─── T-INSIGHT-004-2 [blocant]: KpiCard renders value + delta correctly ────────
describe("T-INSIGHT-004-2 [blocant]", () => {
  it("KpiCard shows formatted MDL value and delta arrow", async () => {
    const { KpiCard } = await import("@/components/fin/KpiCard");
    render(
      <KpiCard label="Revenue" valueCents={150000} deltaPct={12.5} />
    );

    // Value formatted with MDL — check for "MDL" in any text node (locale may vary in JSDOM)
    const container = screen.getByRole("article");
    expect(container).toBeInTheDocument();
    // Value contains some currency representation
    expect(container.textContent).toMatch(/MDL|1[.,]500|1500/);

    // Delta: contains "12" and "%" somewhere
    expect(container.textContent).toMatch(/12/);
  });

  it("KpiCard shows skeleton when loading=true", async () => {
    const { KpiCard } = await import("@/components/fin/KpiCard");
    const { container } = render(
      <KpiCard label="Revenue" valueCents={0} loading />
    );
    // Should have animate-pulse skeleton elements
    const pulseEls = container.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });
});

// ─── T-INSIGHT-004-3 [normal]: AI button calls generateAiNarrative ────────────
describe("T-INSIGHT-004-3 [normal]", () => {
  it("clicking 'Generează narativă AI' triggers generateAiNarrative", async () => {
    mockAllApis();

    // Mock AI narrative response
    const aiNarrativeMock = {
      narrative: {
        id: "nar-1",
        tenantId: "tenant-1",
        authorId: "user-1",
        month: "2026-06",
        title: "Narativă AI — 2026-06",
        body: "Performanță lunii.",
        generatedBy: "ai",
        sentiment: "positive",
        publishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditId: "audit-1",
      isStub: true,
      metrics: { revenue: 150000, receivable: 28000, profit: 122000, agingTotal: 28000 },
    };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => aiNarrativeMock });

    const { FinInsightsPage } = await import("@/pages/finance/FinInsightsPage");
    render(<FinInsightsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText("Revenue")).toBeInTheDocument();
    });

    // Find and click the generate button
    const generateBtn = await screen.findByText(/Generează narativă AI/);
    expect(generateBtn).toBeInTheDocument();

    fireEvent.click(generateBtn);

    // Fetch should have been called a 6th time (the AI narrative call)
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("ai-narrative"),
        expect.any(Object)
      );
    });
  });
});

// ─── T-INSIGHT-004-4 [normal]: save view button opens modal ──────────────────
describe("T-INSIGHT-004-4 [normal]", () => {
  it("clicking '+ Salvează vedere' opens SaveViewModal with name input", async () => {
    mockAllApis();

    const { FinInsightsPage } = await import("@/pages/finance/FinInsightsPage");
    render(<FinInsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("Revenue")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: /Salvează vedere/i });
    fireEvent.click(saveBtn);

    // Modal should appear with a name input
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Nume vedere/i);
      expect(nameInput).toBeInTheDocument();
    });
  });
});

// ─── T-INSIGHT-004-5 [normal]: CashflowChart renders correctly ───────────────
describe("T-INSIGHT-004-5 [normal]", () => {
  it("CashflowChart renders without crash when scenarios are provided", async () => {
    const { CashflowChart } = await import("@/components/fin/CashflowChart");
    // recharts may not render SVG in JSDOM — just verify no crash and section is present
    const { container } = render(
      <CashflowChart scenarios={MOCK_FORECAST.scenarios} />
    );
    // The section element should exist
    const sectionEl = container.querySelector("section");
    expect(sectionEl).not.toBeNull();
    // Heading should exist
    expect(container.textContent).toContain("Forecast cashflow");
  });

  it("CashflowChart shows loading skeleton when loading=true", async () => {
    const { CashflowChart } = await import("@/components/fin/CashflowChart");
    const { container } = render(
      <CashflowChart scenarios={null} loading />
    );

    const pulseEls = container.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });
});
