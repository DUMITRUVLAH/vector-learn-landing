/**
 * PAY-003: Smoke tests — PayrollEmployeesPage
 *
 * T-PAY-003-1 [blocant]: pagina /app/fin/payroll/employees se renderizează fără crash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PayrollEmployeesPage } from "../../pages/fin/PayrollEmployeesPage";

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

const mockEmployees = [
  {
    id: "emp-001",
    fullName: "Ion Popescu",
    jobTitle: "Profesor engleză",
    contractType: "employee" as const,
    baseSalaryCents: 1000000,
    currency: "MDL",
    status: "active" as const,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "emp-002",
    fullName: "Maria Ionescu",
    jobTitle: "Recepție",
    contractType: "employee" as const,
    baseSalaryCents: 700000,
    currency: "MDL",
    status: "active" as const,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  mockFetch.mockReset();
  vi.clearAllMocks();
});

describe("PayrollEmployeesPage", () => {
  it("T-PAY-003-1 [blocant]: renders without crash and shows employee table", async () => {
    // Both active and inactive fetch calls
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: mockEmployees }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response);

    render(<PayrollEmployeesPage />);

    // Page should render without crash — heading visible
    expect(screen.getByRole("heading", { name: /angajați/i })).toBeInTheDocument();

    // Wait for employees to load
    await waitFor(() => {
      expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    });

    expect(screen.getByText("Maria Ionescu")).toBeInTheDocument();
  });

  it("shows add employee button", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response);

    render(<PayrollEmployeesPage />);

    expect(
      screen.getByRole("button", { name: /adaugă angajat/i })
    ).toBeInTheDocument();
  });

  it("shows empty state when no employees", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response);

    render(<PayrollEmployeesPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/niciun angajat înregistrat/i)
      ).toBeInTheDocument();
    });
  });

  it("shows salary formatted correctly", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: mockEmployees }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ employees: [] }),
      } as Response);

    render(<PayrollEmployeesPage />);

    await waitFor(() => {
      // 1000000 cenți = 10.000,00 MDL
      expect(screen.getByText(/10\.000,00 MDL/i)).toBeInTheDocument();
    });
  });
});
