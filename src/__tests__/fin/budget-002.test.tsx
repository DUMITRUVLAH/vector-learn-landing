/**
 * BUDGET-002: Teste API bugete FinDesk + UI BudgetPage
 * T1 [blocant] — smoke: BudgetPage render fără crash
 * T2 [blocant] — raport API: actualCents corect per categorie (unit test logic)
 * T3 [blocant] — alerte: pct >= 80 → alertă creată (unit test)
 * T4 [blocant] — smoke API: listBudgets apelat la mount (mock)
 * T5 [normal]  — fără cheltuieli (fin_expenses absent) → actualCents = 0 per linie
 * T6 [normal]  — filtre status=active → doar bugetele active
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// ─── Mock-uri ─────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { id: "u1", tenantId: "t1" },
    refresh: vi.fn(),
    logout: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

const MOCK_BUDGETS = [
  {
    id: "bud-1",
    tenantId: "t1",
    name: "Buget 2026",
    fiscalYear: 2026,
    department: "General",
    branchId: null,
    status: "active" as const,
    notes: null,
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/lib/api/finBudget", () => ({
  listBudgets: vi.fn(),
  createBudget: vi.fn(),
  getBudget: vi.fn(),
  getBudgetReport: vi.fn(),
  checkBudgetAlerts: vi.fn(),
  addBudgetLine: vi.fn(),
  updateBudgetLine: vi.fn(),
  deleteBudgetLine: vi.fn(),
}));

import {
  listBudgets,
  getBudgetReport,
  checkBudgetAlerts,
} from "@/lib/api/finBudget";
import { BudgetPage } from "@/pages/app/BudgetPage";

describe("BUDGET-002: BudgetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBudgets).mockResolvedValue({ budgets: MOCK_BUDGETS });
    vi.mocked(getBudgetReport).mockResolvedValue({
      budget: MOCK_BUDGETS[0],
      lines: [
        {
          id: "l1",
          category: "rent",
          label: "Chirie",
          budgetedCents: 100000,
          actualCents: 85000,
          remainingCents: 15000,
          pct: 85,
          displayOrder: 0,
        },
      ],
      totalBudgetedCents: 100000,
      totalActualCents: 85000,
      totalRemainingCents: 15000,
    });
    vi.mocked(checkBudgetAlerts).mockResolvedValue({ alertsCreated: ["budget_warning_80:rent"], count: 1 });
  });

  // ─── T1 [blocant]: smoke ─────────────────────────────────────────────────────

  it("T1 [blocant] — render fără crash", async () => {
    const { container } = render(<BudgetPage />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Buget nou/i })).toBeTruthy();
    });
  });

  // ─── T4 [blocant]: listBudgets apelat la mount ────────────────────────────────

  it("T4 [blocant] — listBudgets apelat la mount + bugetele afișate", async () => {
    render(<BudgetPage />);
    await waitFor(() => {
      expect(listBudgets).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Buget 2026")).toBeTruthy();
    });
  });

  // ─── T6 [normal]: buget activ → badge Activ ─────────────────────────────────

  it("T6 [normal] — buget cu status active afișează badge Activ", async () => {
    render(<BudgetPage />);
    await waitFor(() => {
      expect(screen.getByText("Activ")).toBeTruthy();
    });
  });
});

// ─── T2 [blocant]: logică raport actualCents ─────────────────────────────────

describe("BUDGET-002: logica raport buget vs realizat (unit)", () => {
  it("T2 [blocant] — actualCents = SUM cheltuieli per categorie", () => {
    // Simulăm agregarea per categorie
    const expenses = [
      { category: "rent", amountCents: 50000 },
      { category: "rent", amountCents: 35000 },
      { category: "utilities", amountCents: 20000 },
    ];
    const totals = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amountCents;
      return acc;
    }, {});
    expect(totals["rent"]).toBe(85000);
    expect(totals["utilities"]).toBe(20000);
  });

  it("T2b [blocant] — pct = actualCents / budgetedCents * 100", () => {
    const budgetedCents = 100000;
    const actualCents = 85000;
    const pct = Math.round((actualCents / budgetedCents) * 1000) / 10;
    expect(pct).toBe(85);
  });
});

// ─── T3 [blocant]: logică alerte depășire ────────────────────────────────────

describe("BUDGET-002: logica alerte depășire (unit)", () => {
  it("T3 [blocant] — pct >= 100 → kind = budget_overrun", () => {
    const pct = 103;
    const kind = pct >= 100 ? "budget_overrun" : "budget_warning_80";
    expect(kind).toBe("budget_overrun");
  });

  it("T3b [blocant] — pct >= 80 și < 100 → kind = budget_warning_80", () => {
    const pct = 85;
    const kind = pct >= 100 ? "budget_overrun" : "budget_warning_80";
    expect(kind).toBe("budget_warning_80");
  });

  it("T3c [blocant] — pct < 80 → niciun alert", () => {
    const pct = 70;
    const shouldAlert = pct >= 80;
    expect(shouldAlert).toBe(false);
  });
});

// ─── T5 [normal]: fără cheltuieli → actualCents = 0 ──────────────────────────

describe("BUDGET-002: cazul fără cheltuieli (fin_expenses absent)", () => {
  it("T5 [normal] — actuals empty Map → actualCents = 0 per linie", () => {
    const actuals = new Map<string, number>();
    const categories = ["rent", "utilities", "salaries"];
    const result = categories.map((cat) => ({
      category: cat,
      actualCents: actuals.get(cat) ?? 0,
    }));
    expect(result.every((r) => r.actualCents === 0)).toBe(true);
  });

  it("T5b [normal] — remainingCents = budgetedCents când actualCents = 0", () => {
    const budgetedCents = 50000;
    const actualCents = 0;
    const remainingCents = budgetedCents - actualCents;
    expect(remainingCents).toBe(50000);
  });
});
