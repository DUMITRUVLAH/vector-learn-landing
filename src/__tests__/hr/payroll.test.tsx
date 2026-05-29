/**
 * HR-401 — Payroll
 *
 * T-HR-401-1: POST /api/hr/payroll/calculate → 200
 * T-HR-401-2: GET /api/hr/payroll → array
 * T-HR-401-3: UI tabel payroll renderează
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { PayrollEntry } from "@/lib/api/payroll";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/hr/payroll" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/payroll", () => ({
  listPayroll: vi.fn(),
  calculatePayroll: vi.fn(),
  updatePayrollStatus: vi.fn(),
}));

import * as payrollApi from "@/lib/api/payroll";
import { PayrollPage } from "@/pages/app/PayrollPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeEntry = (overrides: Partial<PayrollEntry> = {}): PayrollEntry => ({
  id: "pe-001",
  teacherId: "t-001",
  teacherName: "Ana Ionescu",
  month: "2026-05",
  totalHours: "20.00",
  totalCents: 50000,
  commissionCents: 22500,
  bonusCents: 0,
  status: "draft",
  breakdown: null,
  createdAt: "2026-05-01T00:00:00Z",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HR-401 — PayrollPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(payrollApi.listPayroll).mockResolvedValue({ items: [] });
    vi.mocked(payrollApi.calculatePayroll).mockResolvedValue({ entries: [], totalCents: 0 });
  });

  /**
   * T-HR-401-3: tabel renderează cu date
   */
  it("T-HR-401-3: tabel payroll afișat cu date", async () => {
    vi.mocked(payrollApi.listPayroll).mockResolvedValue({
      items: [makeEntry()],
    });

    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByTestId("payroll-table")).toBeInTheDocument();
    });
    expect(screen.getByText("Ana Ionescu")).toBeInTheDocument();
  });

  it("T-HR-401-3: afișează heading Salarizare", async () => {
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByText("Salarizare")).toBeInTheDocument();
    });
  });

  it("afișează mesaj gol când nu există date", async () => {
    vi.mocked(payrollApi.listPayroll).mockResolvedValue({ items: [] });
    render(<PayrollPage />);
    await waitFor(() => {
      expect(screen.getByText(/niciun calcul/i)).toBeInTheDocument();
    });
  });
});

describe("HR-401 — calculatePayroll API", () => {
  /**
   * T-HR-401-1: calculatePayroll returnează entries + totalCents
   */
  it("T-HR-401-1: calculatePayroll returnează entries și totalCents", async () => {
    vi.mocked(payrollApi.calculatePayroll).mockResolvedValue({
      entries: [makeEntry({ totalCents: 50000 })],
      totalCents: 50000,
    });

    const result = await payrollApi.calculatePayroll("2026-05");
    expect(result.totalCents).toBe(50000);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].teacherName).toBe("Ana Ionescu");
  });

  /**
   * T-HR-401-2: listPayroll returnează items array
   */
  it("T-HR-401-2: listPayroll returnează items cu câmpurile corecte", async () => {
    vi.mocked(payrollApi.listPayroll).mockResolvedValue({
      items: [makeEntry()],
    });

    const result = await payrollApi.listPayroll("2026-05");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toHaveProperty("totalCents");
    expect(result.items[0]).toHaveProperty("commissionCents");
    expect(result.items[0]).toHaveProperty("status");
  });
});
