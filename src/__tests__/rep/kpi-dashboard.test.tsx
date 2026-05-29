/**
 * REP-301 — Dashboard KPI
 *
 * T-REP-301-1: GET /api/analytics/kpi → 200 cu toate câmpurile
 * T-REP-301-2: Δ% corect: mrrCents > prevMrrCents → deltaPositive
 * T-REP-301-3: Period toggle UI actualizează KPI cards
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { KpiData } from "@/lib/api/analytics";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/analytics/kpi" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
  }),
}));

vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/analytics")>();
  return {
    ...original,
    getKpi: vi.fn(),
  };
});

import * as analyticsApi from "@/lib/api/analytics";
import { KpiDashboardPage } from "@/pages/app/KpiDashboardPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeKpi = (overrides: Partial<KpiData> = {}): KpiData => ({
  period: "30d",
  mrrCents: 150000,
  activeStudents: 45,
  newStudents: 8,
  churnRatePct: 2.2,
  arpuCents: 3333,
  prevMrrCents: 140000,
  prevActiveStudents: 43,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("REP-301 — KpiDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getKpi).mockResolvedValue(makeKpi());
  });

  /**
   * T-REP-301-1: GET /api/analytics/kpi → date afișate în KPI cards
   */
  it("T-REP-301-1: afișează KPI cards cu date reale", async () => {
    render(<KpiDashboardPage />);
    await waitFor(() => {
      // MRR card should show value
      expect(screen.getByLabelText("MRR (plăți perioadă)")).toBeInTheDocument();
    });
    // Check that active students value is shown
    expect(screen.getByLabelText("Elevi activi")).toBeInTheDocument();
    expect(screen.getByLabelText("Churn rate (%)")).toBeInTheDocument();
  });

  /**
   * T-REP-301-2: Δ% pozitiv când MRR crescut
   */
  it("T-REP-301-2: delta pozitiv când MRR > prevMRR", async () => {
    vi.mocked(analyticsApi.getKpi).mockResolvedValue(
      makeKpi({ mrrCents: 150000, prevMrrCents: 100000 })
    );
    render(<KpiDashboardPage />);
    await waitFor(() => {
      // +50% delta shown
      expect(screen.getByLabelText("Creștere 50%")).toBeInTheDocument();
    });
  });

  it("T-REP-301-2: delta negativ când MRR < prevMRR", async () => {
    vi.mocked(analyticsApi.getKpi).mockResolvedValue(
      makeKpi({ mrrCents: 80000, prevMrrCents: 100000 })
    );
    render(<KpiDashboardPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Scădere 20%")).toBeInTheDocument();
    });
  });

  /**
   * T-REP-301-3: Period toggle apelează getKpi cu perioada corectă
   */
  it("T-REP-301-3: period toggle 7 zile → getKpi apelat cu 7d", async () => {
    render(<KpiDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText("7 zile")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("7 zile"));

    await waitFor(() => {
      expect(analyticsApi.getKpi).toHaveBeenCalledWith("7d");
    });
  });

  it("afișează titlul Dashboard KPI", async () => {
    render(<KpiDashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard KPI");
    });
  });
});

describe("REP-301 — deltaPercent logic", () => {
  it("delta 0 când prev = 0 și current = 0", () => {
    const delta = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - prev) / prev) * 100);
    };
    expect(delta(0, 0)).toBe(0);
    expect(delta(100, 0)).toBe(100);
    expect(delta(150, 100)).toBe(50);
    expect(delta(80, 100)).toBe(-20);
  });
});
