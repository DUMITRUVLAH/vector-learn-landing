import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { calculatePL, PLCalculator } from "@/components/modules/finante/PLCalculator";
import { PaymentsTable, filterPayments } from "@/components/modules/finante/PaymentsTable";
import { RevenueChart } from "@/components/modules/finante/RevenueChart";
import { FinantePage } from "@/pages/modules/FinantePage";
import { HashRouter } from "@/router/HashRouter";

describe("calculatePL", () => {
  it("computes revenue = students × avgPrice", () => {
    const r = calculatePL({ students: 100, avgPrice: 200, teachers: 5, commission: 40 });
    expect(r.revenue).toBe(20000);
  });

  it("computes cost = revenue * commission% + teachers * 1500", () => {
    const r = calculatePL({ students: 100, avgPrice: 200, teachers: 5, commission: 40 });
    expect(r.cost).toBe(20000 * 0.4 + 5 * 1500);
  });

  it("computes profit = revenue - cost", () => {
    const r = calculatePL({ students: 200, avgPrice: 280, teachers: 12, commission: 45 });
    expect(r.profit).toBe(r.revenue - r.cost);
  });

  it("computes margin as profit/revenue * 100", () => {
    const r = calculatePL({ students: 200, avgPrice: 280, teachers: 12, commission: 45 });
    expect(r.margin).toBeCloseTo((r.profit / r.revenue) * 100, 5);
  });

  it("returns margin = 0 when revenue is 0", () => {
    const r = calculatePL({ students: 0, avgPrice: 0, teachers: 5, commission: 40 });
    expect(r.margin).toBe(0);
  });

  it("clamps negative inputs to 0 revenue", () => {
    const r = calculatePL({ students: -50, avgPrice: 200, teachers: 5, commission: 40 });
    expect(r.revenue).toBe(0);
  });
});

describe("PLCalculator", () => {
  it("renders with default values and shows a non-negative profit", () => {
    render(<PLCalculator />);
    expect(screen.getByTestId("pl-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("pl-cost")).toBeInTheDocument();
    expect(screen.getByTestId("pl-profit")).toBeInTheDocument();
    expect(screen.getByTestId("pl-margin")).toBeInTheDocument();
  });

  it("recalculates when students slider changes", () => {
    render(<PLCalculator />);
    const studentSlider = screen.getByLabelText(/Elevi activi/i) as HTMLInputElement;
    const initialRevenue = screen.getByTestId("pl-revenue").textContent;
    fireEvent.change(studentSlider, { target: { value: "500" } });
    expect(screen.getByTestId("pl-revenue").textContent).not.toBe(initialRevenue);
  });
});

describe("filterPayments", () => {
  const sample = [
    { id: "A", date: "x", daysAgo: 1, student: "Ana Pop", course: "Engleză", amount: 100, method: "card" as const, status: "paid" as const },
    { id: "B", date: "x", daysAgo: 5, student: "Mihai", course: "Pian", amount: 200, method: "qr" as const, status: "pending" as const },
    { id: "C", date: "x", daysAgo: 40, student: "Elena", course: "Python", amount: 300, method: "card" as const, status: "paid" as const },
  ];

  it("returns all when status=all and period=all and query empty", () => {
    expect(filterPayments(sample, "all", "all", "")).toHaveLength(3);
  });

  it("filters by status correctly", () => {
    expect(filterPayments(sample, "paid", "all", "")).toHaveLength(2);
    expect(filterPayments(sample, "pending", "all", "")).toHaveLength(1);
  });

  it("filters by period 7d correctly", () => {
    expect(filterPayments(sample, "all", "7d", "")).toHaveLength(2);
  });

  it("filters by period 30d correctly", () => {
    expect(filterPayments(sample, "all", "30d", "")).toHaveLength(2);
  });

  it("filters by search query on student name", () => {
    expect(filterPayments(sample, "all", "all", "Mihai")).toHaveLength(1);
  });

  it("filters by search query on course name (case-insensitive)", () => {
    expect(filterPayments(sample, "all", "all", "pian")).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterPayments(sample, "overdue", "all", "")).toHaveLength(0);
  });
});

describe("PaymentsTable", () => {
  it("renders table headers and at least one row", () => {
    render(<PaymentsTable />);
    expect(screen.getByText(/Factură/i)).toBeInTheDocument();
    expect(screen.getByText(/Elev \/ Curs/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Status/i).length).toBeGreaterThan(0);
  });

  it("shows count of filtered payments", () => {
    render(<PaymentsTable />);
    expect(screen.getByTestId("payments-count")).toBeInTheDocument();
  });
});

describe("RevenueChart", () => {
  it("renders one <rect data-testid='chart-bar'/> per data point", () => {
    render(<RevenueChart />);
    const bars = screen.getAllByTestId("chart-bar");
    expect(bars).toHaveLength(7);
  });

  it("renders chart with custom data length", () => {
    const data = [
      { label: "A", value: 100 },
      { label: "B", value: 200 },
      { label: "C", value: 300 },
    ];
    render(<RevenueChart data={data} />);
    expect(screen.getAllByTestId("chart-bar")).toHaveLength(3);
  });
});

describe("FinantePage", () => {
  it("renders hero with module badge", () => {
    render(
      <HashRouter>
        <FinantePage />
      </HashRouter>
    );
    expect(screen.getByText(/Modulul Finanțe/i)).toBeInTheDocument();
  });

  it("renders P&L calculator", () => {
    render(
      <HashRouter>
        <FinantePage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Configurează scenariul tău/i).length).toBeGreaterThan(0);
  });

  it("renders 4 main feature sections", () => {
    render(
      <HashRouter>
        <FinantePage />
      </HashRouter>
    );
    expect(screen.getByText(/Plăți online integrate/i)).toBeInTheDocument();
    expect(screen.getByText(/Salarii profesori automate/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Rapoarte financiare/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Integrări fiscale RO/i)).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(
      <HashRouter>
        <FinantePage />
      </HashRouter>
    );
    expect(screen.getByText(/Cum se face exportul către 1C/i)).toBeInTheDocument();
  });

  it("renders security & compliance section", () => {
    render(
      <HashRouter>
        <FinantePage />
      </HashRouter>
    );
    expect(screen.getByText(/PCI-DSS Level 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Găzduit în UE/i)).toBeInTheDocument();
  });
});
