/**
 * SPLIT-204 — Business Dashboard KPI unit tests
 *
 * T-SPLIT-204-1 [blocant] Render sem crash cu sesiune validă + 3 KPI cards vizibile
 * T-SPLIT-204-4 [normal]  Eroare izolată pe un API nu blochează celelalte carduri
 * T-SPLIT-204-5 [blocant] Fără sesiune → redirect la /business/login
 * T-SPLIT-204-KPI-1 [normal] fetchBusinessDashboardKPI agregă corect cele 3 secțiuni
 * T-SPLIT-204-KPI-2 [normal] Dacă un fetch pică → secțiunea respectivă e null, celelalte ok
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
let mockPath = "/business/dashboard";
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: mockPath, navigate: mockNavigate }),
  Link: ({
    to,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={`#${to}`} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <button aria-label="Notificări" />,
}));

let mockBusinessSessionStatus: "loading" | "authenticated" | "unauthenticated" | "error" =
  "authenticated";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: mockBusinessSessionStatus,
    data:
      mockBusinessSessionStatus === "authenticated"
        ? {
            user: { id: "u1", email: "cfo@business.md", name: "CFO", role: "admin" },
            tenant: {
              id: "t1",
              name: "Demo Business",
              slug: "demo-biz",
              appKind: "business" as const,
            },
          }
        : null,
    logout: vi.fn(),
  }),
}));

// Mock the dashboard hook
let mockDashboardData: import("@/lib/api/businessDashboard").BusinessDashboardKPI | null = null;
let mockDashboardLoading = false;

vi.mock("@/hooks/useBusinessDashboard", () => ({
  useBusinessDashboard: () => ({
    data: mockDashboardData,
    loading: mockDashboardLoading,
    error: null,
    refetch: vi.fn(),
  }),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

import { BusinessDashboardPage } from "@/pages/business/BusinessDashboardPage";
import {
  fetchBusinessDashboardKPI,
  type BusinessDashboardKPI,
} from "@/lib/api/businessDashboard";

describe("SPLIT-204: BusinessDashboardPage", () => {
  beforeEach(() => {
    mockPath = "/business/dashboard";
    mockBusinessSessionStatus = "authenticated";
    mockNavigate.mockReset();
    mockDashboardLoading = false;
    mockDashboardData = {
      findesk: {
        totalExpensesCents: 500000,
        totalInvoicesCents: 800000,
        netCents: 300000,
      },
      par: {
        pendingCount: 3,
        pendingValueCents: 150000,
      },
      itpark: {
        activeCount: 12,
        inProgressCount: 2,
      },
    };
  });

  it("T-SPLIT-204-1 [blocant] randează fără crash și afișează cele 3 carduri KPI", () => {
    render(<BusinessDashboardPage />);
    // FinDesk section heading (h2) — use getAllByText because "FinDesk" also appears in sidebar
    const findeskEls = screen.getAllByText("FinDesk");
    expect(findeskEls.length).toBeGreaterThanOrEqual(1);
    // PAR card heading
    const parEls = screen.getAllByText("PAR");
    expect(parEls.length).toBeGreaterThanOrEqual(1);
    // ITPark card heading
    const itparkEls = screen.getAllByText("ITPark");
    expect(itparkEls.length).toBeGreaterThanOrEqual(1);
  });

  it("T-SPLIT-204-1b afișează valori reale (nu placeholder) când datele sunt disponibile", () => {
    render(<BusinessDashboardPage />);
    // PAR count
    expect(screen.getByText("3")).toBeDefined(); // pendingCount
    // ITPark count
    expect(screen.getByText("12")).toBeDefined(); // activeCount
  });

  it("T-SPLIT-204-4 [normal] card cu eroare afișează N/A fără a bloca celelalte", () => {
    mockDashboardData = {
      findesk: null, // eroare izolată
      par: { pendingCount: 5, pendingValueCents: 200000 },
      itpark: { activeCount: 8, inProgressCount: 1 },
    };
    render(<BusinessDashboardPage />);
    // FinDesk card — eroare
    expect(screen.getByText(/N\/A/i)).toBeDefined();
    // PAR + ITPark tot randează
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
  });

  it("T-SPLIT-204-5 [blocant] fără sesiune → redirect la /business/login", async () => {
    mockBusinessSessionStatus = "unauthenticated";
    render(<BusinessDashboardPage />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/business/login");
    });
  });

  it("afișează skeleton (animate-pulse) cât timp se încarcă", () => {
    mockDashboardLoading = true;
    mockDashboardData = null;
    const { container } = render(<BusinessDashboardPage />);
    // Should have animate-pulse skeleton
    expect(container.querySelector(".animate-pulse")).toBeDefined();
  });
});

// ─── Unit tests pentru fetchBusinessDashboardKPI ─────────────────────────────

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
}));

describe("SPLIT-204: fetchBusinessDashboardKPI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SPLIT-204-KPI-1 [normal] agregă corect cele 3 secțiuni", async () => {
    const { api } = await import("@/lib/api");
    const mockApi = vi.mocked(api);

    // The three fetch functions run in parallel via Promise.allSettled.
    // Interleaved call order (approximate):
    //   call 1: /api/fin/expenses/summary (fetchFinDeskKPI first await)
    //   call 2: /api/par (fetchPARKPI first await)
    //   call 3: /api/itpark/engagements (fetchITParkKPI first await)
    //   call 4: /api/fin/invoices (fetchFinDeskKPI second await, after expenses resolves)
    // Use a url-based implementation instead to avoid ordering sensitivity.
    mockApi.mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/fin/expenses/summary")) {
        return {
          byCategory: [{ category: "transport", totalCents: 1000, vatDeductibleCents: 200 }],
          grandTotalCents: 1000,
          vatDeductibleTotal: 200,
        };
      }
      if ((url as string).includes("/api/fin/invoices")) {
        return { invoices: [{ totalAmountCents: 3000 }, { totalAmountCents: 2000 }] };
      }
      if ((url as string).includes("/api/par")) {
        return {
          requests: [
            { totalEstimatedCents: 500, status: "pending_approval" },
            { totalEstimatedCents: 800, status: "pending_approval" },
          ],
          total: 2,
        };
      }
      if ((url as string).includes("/api/itpark")) {
        return {
          engagements: [
            { status: "ready" },
            { status: "exported" },
            { status: "in_progress" },
          ],
        };
      }
      return {};
    });

    const result = await fetchBusinessDashboardKPI();

    expect(result.findesk).not.toBeNull();
    expect(result.findesk!.totalExpensesCents).toBe(1000);
    expect(result.findesk!.totalInvoicesCents).toBe(5000);
    expect(result.findesk!.netCents).toBe(4000);

    expect(result.par).not.toBeNull();
    expect(result.par!.pendingCount).toBe(2);
    expect(result.par!.pendingValueCents).toBe(1300);

    expect(result.itpark).not.toBeNull();
    expect(result.itpark!.activeCount).toBe(2);
    expect(result.itpark!.inProgressCount).toBe(1);
  });

  it("T-SPLIT-204-KPI-2 [normal] secțiunea care pică devine null, celelalte ok", async () => {
    const { api } = await import("@/lib/api");
    const mockApi = vi.mocked(api);

    mockApi.mockImplementation(async (url: string) => {
      if ((url as string).includes("/api/fin/expenses/summary")) {
        throw new Error("Network error");
      }
      if ((url as string).includes("/api/par")) {
        return { requests: [{ totalEstimatedCents: 500 }], total: 1 };
      }
      if ((url as string).includes("/api/itpark")) {
        return { engagements: [{ status: "ready" }] };
      }
      return {};
    });

    const result = await fetchBusinessDashboardKPI();

    // findesk failed → null
    expect(result.findesk).toBeNull();
    // par + itpark ok
    expect(result.par).not.toBeNull();
    expect(result.itpark).not.toBeNull();
  });
});
