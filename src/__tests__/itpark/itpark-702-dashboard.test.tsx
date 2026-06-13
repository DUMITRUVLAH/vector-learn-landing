/**
 * ITPARK-702: MITP Compliance Dashboard — unit tests
 * Tests:
 *   T-702-1 [blocant] renders without crash
 *   T-702-2 [blocant] summary cards
 *   T-702-3 [blocant] badge conform for eligiblePct=72
 *   T-702-4 [normal] badge warning for eligiblePct=65
 *   T-702-5 [normal] badge risc for eligiblePct=50
 *   T-702-6 [normal] filter risc hides conform items
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock getDashboard ────────────────────────────────────────────────────────
vi.mock("../../lib/api/itparkDashboard", () => ({
  getDashboard: vi.fn(),
}));

import { getDashboard } from "../../lib/api/itparkDashboard";
import ItparkDashboardPage from "../../pages/app/fin/itpark/ItparkDashboardPage";

const mockGetDashboard = getDashboard as unknown as ReturnType<typeof vi.fn>;

const MOCK_ITEMS = [
  {
    engagementId: "eng-001",
    residentName: "Alpha SRL",
    idno: "1234567",
    eligiblePct: 72.0,
    thresholdStatus: "conform" as const,
    status: "ready" as const,
    daysUntilDeadline: 120,
    reportingYear: 2025,
  },
  {
    engagementId: "eng-002",
    residentName: "Beta SA",
    idno: "7654321",
    eligiblePct: 65.0,
    thresholdStatus: "warning" as const,
    status: "in_progress" as const,
    daysUntilDeadline: 120,
    reportingYear: 2025,
  },
  {
    engagementId: "eng-003",
    residentName: "Gamma ONG",
    idno: "9999999",
    eligiblePct: 50.0,
    thresholdStatus: "risc" as const,
    status: "draft" as const,
    daysUntilDeadline: 120,
    reportingYear: 2025,
  },
];

const MOCK_SUMMARY = {
  total: 3,
  belowThreshold: 2,
  ready: 1,
  exported: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDashboard.mockResolvedValue({
    items: MOCK_ITEMS,
    summary: MOCK_SUMMARY,
    year: 2025,
  });
});

// ─── T-702-1 [blocant] renders without crash ─────────────────────────────────
describe("T-702-1 [blocant] ItparkDashboardPage renders without crash", () => {
  it("renders heading and loading state", () => {
    mockGetDashboard.mockReturnValueOnce(new Promise(() => {}));
    const { container } = render(<ItparkDashboardPage />);
    expect(container).toBeTruthy();
    const heading = container.querySelector("h1");
    expect(heading).toBeTruthy();
  });

  it("renders table after data loads", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText("Alpha SRL")).toBeTruthy();
    });
  });
});

// ─── T-702-2 [blocant] summary cards render ──────────────────────────────────
describe("T-702-2 [blocant] summary cards", () => {
  it("shows 4 summary cards with correct values", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-summary-cards")).toBeTruthy();
    });
    const cards = screen.getByTestId("dashboard-summary-cards");
    expect(cards.textContent).toContain("3"); // total
    expect(cards.textContent).toContain("2"); // belowThreshold
    expect(cards.textContent).toContain("1"); // ready
  });
});

// ─── T-702-3 [blocant] badge conform ─────────────────────────────────────────
describe("T-702-3 [blocant] badge thresholdStatus=conform for eligiblePct=72", () => {
  it("renders Conform badge for eligiblePct 72%", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      const conformBadges = screen.getAllByText("Conform");
      expect(conformBadges.length).toBeGreaterThan(0);
    });
  });
});

// ─── T-702-4 [normal] badge warning ──────────────────────────────────────────
describe("T-702-4 [normal] badge warning for eligiblePct=65", () => {
  it("renders Avertizare badge for eligiblePct 65%", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      const warningBadges = screen.getAllByText("Avertizare");
      expect(warningBadges.length).toBeGreaterThan(0);
    });
  });
});

// ─── T-702-5 [normal] badge risc ─────────────────────────────────────────────
describe("T-702-5 [normal] badge risc for eligiblePct=50", () => {
  it("renders Risc badge for eligiblePct 50%", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      const riscBadges = screen.getAllByText("Risc");
      expect(riscBadges.length).toBeGreaterThan(0);
    });
  });
});

// ─── T-702-6 [normal] filter risc ────────────────────────────────────────────
describe("T-702-6 [normal] filter risc hides conform items", () => {
  it("shows only risc items when risc filter is selected", async () => {
    render(<ItparkDashboardPage />);
    await waitFor(() => {
      expect(screen.getByText("Alpha SRL")).toBeTruthy();
    });

    const thresholdSelect = screen.getByLabelText(/status prag/i) as HTMLSelectElement;
    fireEvent.change(thresholdSelect, { target: { value: "risc" } });

    expect(screen.queryByText("Alpha SRL")).toBeNull();
    expect(screen.getByText("Gamma ONG")).toBeTruthy();
  });
});
