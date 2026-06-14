/**
 * BUDGET-003: Teste componente grafice FinDesk Bugete
 *
 * T1 [blocant] — BudgetBarChart cu 3 categorii (60%/85%/110%) renders fără erori
 * T2 [blocant] — BudgetProgressRing cu pct=87: SVG prezent + aria-valuenow="87"
 * T3 [blocant] — BudgetAlertsPanel cu linie la 105%: randul destructive vizibil
 * T4 [blocant] — BudgetPage smoke: render fără erori de runtime
 * T5 [normal]  — BudgetBarChart cu pct < 80%: bara realizat are clasa success
 * T6 [normal]  — BudgetAlertsPanel fără alerte: null (ascuns)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Mock-uri globale ─────────────────────────────────────────────────────────

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

vi.mock("@/lib/api/finBudget", () => ({
  listBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
  createBudget: vi.fn(),
  getBudget: vi.fn(),
  getBudgetReport: vi.fn(),
  checkBudgetAlerts: vi.fn(),
}));

// ─── Date de test ─────────────────────────────────────────────────────────────

import type { BudgetReportLine } from "@/lib/api/finBudget";

function makeLine(overrides: Partial<BudgetReportLine> & { id: string }): BudgetReportLine {
  return {
    id: overrides.id,
    category: overrides.category ?? "rent",
    label: overrides.label ?? "Chirie",
    budgetedCents: overrides.budgetedCents ?? 100_000,
    actualCents: overrides.actualCents ?? 60_000,
    remainingCents: overrides.remainingCents ?? 40_000,
    pct: overrides.pct ?? 60,
    displayOrder: overrides.displayOrder ?? 0,
  };
}

// Linii la 60%, 85%, 110%
const THREE_LINES: BudgetReportLine[] = [
  makeLine({ id: "l1", category: "rent", label: "Chirie", budgetedCents: 100_000, actualCents: 60_000, remainingCents: 40_000, pct: 60 }),
  makeLine({ id: "l2", category: "salaries", label: "Salarii", budgetedCents: 200_000, actualCents: 170_000, remainingCents: 30_000, pct: 85 }),
  makeLine({ id: "l3", category: "utilities", label: "Utilități", budgetedCents: 50_000, actualCents: 55_000, remainingCents: -5_000, pct: 110 }),
];

// ─── Import componente ────────────────────────────────────────────────────────

import { BudgetBarChart } from "@/components/fin/BudgetBarChart";
import { BudgetProgressRing } from "@/components/fin/BudgetProgressRing";
import { BudgetAlertsPanel } from "@/components/fin/BudgetAlertsPanel";
import type { BudgetAlertItem } from "@/components/fin/BudgetAlertsPanel";
import { BudgetPage } from "@/pages/app/BudgetPage";

// ─── T1: BudgetBarChart cu 3 categorii ───────────────────────────────────────

describe("BudgetBarChart", () => {
  it("[T1 blocant] render cu 3 categorii (60%/85%/110%) fără erori", () => {
    const { container } = render(<BudgetBarChart lines={THREE_LINES} />);
    // Toate cele 3 etichete de categorie prezente
    expect(screen.getByText("Chirie")).toBeDefined();
    expect(screen.getByText("Salarii")).toBeDefined();
    expect(screen.getByText("Utilități")).toBeDefined();
    // Niciun crash (container nenul)
    expect(container.firstChild).not.toBeNull();
  });

  it("[T5 normal] bara realizat cu pct < 80 are clasa success", () => {
    const line = makeLine({ id: "l-low", pct: 60, actualCents: 60_000, budgetedCents: 100_000, remainingCents: 40_000 });
    const { container } = render(<BudgetBarChart lines={[line]} />);
    // Bara realizat are clasa bg-success (nu destructive, nu warning)
    const realizatBar = container.querySelector("[role='progressbar']");
    expect(realizatBar).not.toBeNull();
    expect(realizatBar!.className).toContain("bg-success");
    expect(realizatBar!.className).not.toContain("bg-destructive");
    expect(realizatBar!.className).not.toContain("bg-warning");
  });

  it("afișează mesaj gol dacă linii=[  ]", () => {
    render(<BudgetBarChart lines={[]} />);
    expect(screen.getByText(/nicio linie/i)).toBeDefined();
  });
});

// ─── T2: BudgetProgressRing ───────────────────────────────────────────────────

describe("BudgetProgressRing", () => {
  it("[T2 blocant] SVG prezent + aria-valuenow=87", () => {
    const { container } = render(<BudgetProgressRing pct={87} />);
    const ring = container.querySelector("[role='progressbar']");
    expect(ring).not.toBeNull();
    expect(ring!.getAttribute("aria-valuenow")).toBe("87");
    expect(ring!.getAttribute("aria-valuemin")).toBe("0");
    expect(ring!.getAttribute("aria-valuemax")).toBe("100");
    // SVG prezent
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("culoare destructive când pct >= 100", () => {
    const { container } = render(<BudgetProgressRing pct={110} />);
    const ring = container.querySelector("[role='progressbar']");
    expect(ring!.getAttribute("aria-valuenow")).toBe("110");
    // Textul % are clasa destructive
    const span = container.querySelector("span.tabular-nums");
    expect(span).not.toBeNull();
    expect(span!.className).toContain("text-destructive");
  });

  it("culoare warning când pct 80–99", () => {
    const { container } = render(<BudgetProgressRing pct={85} />);
    const span = container.querySelector("span.tabular-nums");
    expect(span!.className).toContain("text-warning");
  });
});

// ─── T3: BudgetAlertsPanel ───────────────────────────────────────────────────

describe("BudgetAlertsPanel", () => {
  it("[T3 blocant] cu linie la 105% afișează alert cu clasa destructive", () => {
    const alerts: BudgetAlertItem[] = [
      {
        budgetId: "bud-1",
        budgetName: "Buget 2026",
        lineId: "l3",
        lineLabel: "Utilități",
        category: "utilities",
        pct: 105,
        kind: "overrun",
      },
    ];
    const { container } = render(<BudgetAlertsPanel alerts={alerts} />);
    // Panoul este vizibil (nu null)
    expect(container.firstChild).not.toBeNull();
    // Conține textul liniei
    expect(screen.getByText("Utilități")).toBeDefined();
    // Are clasă destructive
    const panel = container.querySelector("[role='alert']");
    expect(panel).not.toBeNull();
    expect(panel!.className).toContain("destructive");
  });

  it("[T6 normal] cu alerts=[] returnează null (ascuns)", () => {
    const { container } = render(<BudgetAlertsPanel alerts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("cu alerte de tip warning afișează clasa warning", () => {
    const alerts: BudgetAlertItem[] = [
      {
        budgetId: "bud-1",
        budgetName: "Buget 2026",
        lineId: "l2",
        lineLabel: "Salarii",
        category: "salaries",
        pct: 85,
        kind: "warning",
      },
    ];
    const { container } = render(<BudgetAlertsPanel alerts={alerts} />);
    const panel = container.querySelector("[role='alert']");
    expect(panel!.className).toContain("warning");
  });
});

// ─── T4: BudgetPage smoke ────────────────────────────────────────────────────

describe("BudgetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[T4 blocant] BudgetPage render fără erori (smoke)", async () => {
    const { container } = render(<BudgetPage />);
    expect(container).toBeDefined();
    expect(screen.getByTestId("app-shell")).toBeDefined();
  });
});
