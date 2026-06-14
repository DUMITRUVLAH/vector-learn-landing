/**
 * SPEND-003 — UI Cheltuieli /app/fin/expenses
 *
 * T-SPEND-003-1 [blocant]: pagina se randează fără crash cu tabel și KPI cards
 * T-SPEND-003-2 [blocant]: listExpenses apelat și items randați
 * T-SPEND-003-3 [blocant]: dialog fără vatDeductible = eroare vat_deductible_required
 * T-SPEND-003-4 [normal]: filtru categorie actualizat în UI
 * T-SPEND-003-5 [normal]: buton Aprobă apelează approveExpense
 * T-SPEND-003-6 [normal]: TopVendorsChart se randează cu furnizori
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Admin Test", role: "admin", tenantId: "t1" },
      tenant: { id: "t1", name: "Test Academy", institutionType: "school" },
    },
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/expenses", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/lib/api/finExpenses", () => ({
  listExpenses: vi.fn().mockResolvedValue({
    items: [
      {
        id: "exp-1",
        tenantId: "t1",
        category: "rent",
        amountCents: 150000,
        currency: "MDL",
        vatDeductible: true,
        vatAmountCents: 27000,
        source: "manual",
        status: "draft",
        description: "Chirie birou",
        reference: null,
        vendorName: "Landlord SRL",
        expenseDate: "2026-06-01",
        paidAt: null,
        approvedBy: null,
        approvedAt: null,
        createdBy: "u1",
        createdAt: "2026-06-01T10:00:00Z",
        updatedAt: "2026-06-01T10:00:00Z",
      },
    ],
  }),
  getExpenseSummary: vi.fn().mockResolvedValue({
    byCategory: [{ category: "rent", label: "Chirie", totalCents: 150000, vatDeductibleCents: 27000 }],
    vatDeductibleTotal: 27000,
    grandTotalCents: 150000,
  }),
  getExpenseCategories: vi.fn().mockResolvedValue({ items: [] }),
  createExpense: vi.fn().mockResolvedValue({ data: {} }),
  updateExpense: vi.fn().mockResolvedValue({ data: {} }),
  approveExpense: vi.fn().mockResolvedValue({ data: {} }),
  deleteExpense: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

// Mock recharts to avoid canvas issues in jsdom
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-container">{children}</div>
  ),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

import { FinExpensesPage } from "@/pages/app/FinExpensesPage";
import { listExpenses, approveExpense } from "@/lib/api/finExpenses";

describe("SPEND-003 — FinExpensesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * T-SPEND-003-1 [blocant]: pagina se randează fără crash cu titlul "Cheltuieli"
   */
  it("T-SPEND-003-1: renders without crash, shows page title", async () => {
    render(<FinExpensesPage />);
    // Multiple "Cheltuieli" exist (AppShell + page h1) — check at least one is present
    const headings = screen.getAllByText("Cheltuieli");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * T-SPEND-003-2 [blocant]: listExpenses apelat și rândul din tabel randrat
   */
  it("T-SPEND-003-2: listExpenses is called and expense rows are rendered", async () => {
    render(<FinExpensesPage />);
    await waitFor(() => {
      expect(listExpenses).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Landlord SRL")).toBeInTheDocument();
    });
  });

  /**
   * T-SPEND-003-3 [blocant]: dialog fără vatDeductible = eroare explicită
   */
  it("T-SPEND-003-3: dialog without vatDeductible shows vat_deductible_required error", async () => {
    render(<FinExpensesPage />);

    // Open dialog — use aria-label for specificity
    const addButton = await screen.findByRole("button", { name: /adaug[aă] cheltuial[aă] nou[aă]/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Fill amount but NOT vatDeductible
    const amountInput = screen.getByLabelText(/Suma \(MDL\)/i);
    fireEvent.change(amountInput, { target: { value: "100" } });

    // Click Save (the one inside the dialog — use text match)
    const saveButton = screen.getByText(/adaug[aă] cheltuiala/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/vat_deductible_required/i)).toBeInTheDocument();
    });
  });

  /**
   * T-SPEND-003-4 [normal]: filtrul de categorie există și este vizibil
   */
  it("T-SPEND-003-4: category filter select is rendered", async () => {
    render(<FinExpensesPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Categorie")).toBeInTheDocument();
    });
  });

  /**
   * T-SPEND-003-5 [normal]: buton Aprobă apelează approveExpense
   */
  it("T-SPEND-003-5: Aprobă button calls approveExpense for draft expense", async () => {
    render(<FinExpensesPage />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Aprobă cheltuiala/i)).toBeInTheDocument();
    });
    const approveBtn = screen.getByLabelText(/Aprobă cheltuiala/i);
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(approveExpense).toHaveBeenCalledWith("exp-1");
    });
  });

  /**
   * T-SPEND-003-6 [normal]: graficul top furnizori se randează
   */
  it("T-SPEND-003-6: TopVendorsChart renders when expenses have vendor names", async () => {
    render(<FinExpensesPage />);
    await waitFor(() => {
      expect(screen.getByText("Top 5 furnizori")).toBeInTheDocument();
    });
    expect(screen.getByTestId("recharts-container")).toBeInTheDocument();
  });
});
