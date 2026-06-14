/**
 * PAY-003: Smoke tests — PayrollRunDetailPage
 *
 * T-PAY-003-2 [blocant]: pagina /app/fin/payroll/runs/:id se renderizează fără crash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PayrollRunDetailPage } from "../../pages/fin/PayrollRunDetailPage";

// Mock AppShell (uses useRouter internally — needs HashRouter in tests)
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <div data-testid="app-shell" data-title={pageTitle}>
      {children}
    </div>
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location.hash to simulate URL with run ID
Object.defineProperty(window, "location", {
  writable: true,
  value: { hash: "#/app/fin/payroll/runs/run-001" },
});

const mockRun = {
  id: "run-001",
  tenantId: "tenant-001",
  periodMonth: "2026-06",
  status: "confirmed" as const,
  confirmedAt: "2026-06-10T10:00:00Z",
  paidAt: null,
  notes: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-10T10:00:00Z",
};

const mockItems = [
  {
    id: "item-001",
    tenantId: "tenant-001",
    runId: "run-001",
    employeeId: "emp-001",
    grossCents: 1000000,
    deductionsJsonb: {
      cas_employee_cents: 240000,
      cass_employee_cents: 90000,
      income_tax_cents: 80280,
    },
    netCents: 589720,
    employerCostCents: 1270000,
    createdAt: "2026-06-10T10:00:00Z",
    employee: {
      id: "emp-001",
      fullName: "Ion Popescu",
      jobTitle: "Profesor engleză",
      contractType: "employee",
      currency: "MDL",
    },
  },
];

beforeEach(() => {
  mockFetch.mockReset();
  vi.clearAllMocks();
});

describe("PayrollRunDetailPage", () => {
  it("T-PAY-003-2 [blocant]: renders without crash and shows payroll items table", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run: mockRun, items: mockItems }),
    } as Response);

    render(<PayrollRunDetailPage />);

    // Heading should render immediately
    const headings = screen.getAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    });

    // Columns: brut/net/cost
    expect(screen.getByText("Brut")).toBeInTheDocument();
    expect(screen.getByText("Net")).toBeInTheDocument();
    expect(screen.getByText(/cost ang\./i)).toBeInTheDocument();
  });

  it("shows mark-paid button for confirmed runs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run: mockRun, items: mockItems }),
    } as Response);

    render(<PayrollRunDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /marcare plătit/i })
      ).toBeInTheDocument();
    });
  });

  it("shows Export CSV button when items exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run: mockRun, items: mockItems }),
    } as Response);

    render(<PayrollRunDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /export csv/i })
      ).toBeInTheDocument();
    });
  });

  it("shows totals row in table", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run: mockRun, items: mockItems }),
    } as Response);

    render(<PayrollRunDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Total")).toBeInTheDocument();
    });
  });

  it("does NOT show mark-paid button for paid runs", async () => {
    const paidRun = {
      ...mockRun,
      status: "paid" as const,
      paidAt: "2026-06-15T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ run: paidRun, items: mockItems }),
    } as Response);

    render(<PayrollRunDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /marcare plătit/i })
    ).not.toBeInTheDocument();
  });
});
