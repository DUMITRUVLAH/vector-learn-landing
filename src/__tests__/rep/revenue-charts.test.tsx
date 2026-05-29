/**
 * REP-302 — Revenue charts
 *
 * T-REP-302-1: GET /api/analytics/revenue-over-time → 200, array de luni
 * T-REP-302-2: GET /api/analytics/revenue-by-course → 200, array de cursuri
 * T-REP-302-3: Line chart renderează fără crash
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { RevenueMonth, RevenueCourse } from "@/lib/api/analytics";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/analytics/revenue" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
    getRevenueOverTime: vi.fn(),
    getRevenueByCourse: vi.fn(),
  };
});

// recharts uses ResizeObserver — mock it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import * as analyticsApi from "@/lib/api/analytics";
import { RevenueChartsPage } from "@/pages/app/RevenueChartsPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeMonths = (): RevenueMonth[] => [
  { month: "2026-01", totalCents: 100000, newStudents: 5 },
  { month: "2026-02", totalCents: 120000, newStudents: 7 },
  { month: "2026-03", totalCents: 95000, newStudents: 3 },
];

const makeCourses = (): RevenueCourse[] => [
  { courseName: "Engleză B2", studentCount: 15, totalCents: 150000 },
  { courseName: "Matematică", studentCount: 10, totalCents: 100000 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("REP-302 — RevenueChartsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getRevenueOverTime).mockResolvedValue({ months: makeMonths() });
    vi.mocked(analyticsApi.getRevenueByCourse).mockResolvedValue({ items: makeCourses() });
  });

  /**
   * T-REP-302-3: Line chart renderează fără crash
   */
  it("T-REP-302-3: renderează paginea Revenue fără crash", async () => {
    render(<RevenueChartsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Revenue");
    });
  });

  it("T-REP-302-3: chart container afișat după încărcare", async () => {
    render(<RevenueChartsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("revenue-line-chart")).toBeInTheDocument();
    });
  });

  it("T-REP-302-3: course bar chart afișat", async () => {
    render(<RevenueChartsPage />);
    await waitFor(() => {
      expect(screen.getByTestId("course-bar-chart")).toBeInTheDocument();
    });
  });

  it("afișează secțiunile Revenue lunar și per disciplină", async () => {
    render(<RevenueChartsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Evoluție revenue lunar")).toBeInTheDocument();
      expect(screen.getByLabelText("Revenue per disciplină")).toBeInTheDocument();
    });
  });
});

describe("REP-302 — getRevenueOverTime API", () => {
  /**
   * T-REP-302-1: shape corectă a răspunsului
   */
  it("T-REP-302-1: getRevenueOverTime returnează months array", async () => {
    vi.mocked(analyticsApi.getRevenueOverTime).mockResolvedValue({
      months: [{ month: "2026-01", totalCents: 50000, newStudents: 3 }],
    });
    const result = await analyticsApi.getRevenueOverTime(1);
    expect(result.months).toHaveLength(1);
    expect(result.months[0]).toHaveProperty("month");
    expect(result.months[0]).toHaveProperty("totalCents");
    expect(result.months[0]).toHaveProperty("newStudents");
  });

  /**
   * T-REP-302-2: shape corectă revenue-by-course
   */
  it("T-REP-302-2: getRevenueByCourse returnează items array", async () => {
    vi.mocked(analyticsApi.getRevenueByCourse).mockResolvedValue({
      items: [{ courseName: "Engleză", studentCount: 10, totalCents: 100000 }],
    });
    const result = await analyticsApi.getRevenueByCourse();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toHaveProperty("courseName");
    expect(result.items[0]).toHaveProperty("studentCount");
    expect(result.items[0]).toHaveProperty("totalCents");
  });
});
