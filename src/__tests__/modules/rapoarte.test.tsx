import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KPICard } from "@/components/modules/rapoarte/KPICard";
import { LineChart } from "@/components/modules/rapoarte/LineChart";
import { BarChart } from "@/components/modules/rapoarte/BarChart";
import { RapoartePage } from "@/pages/modules/RapoartePage";
import { HashRouter } from "@/router/HashRouter";

describe("KPICard", () => {
  it("renders label and value (no animation)", () => {
    render(<KPICard label="MRR" value={1234} format="currency" animate={false} />);
    expect(screen.getByText(/MRR/i)).toBeInTheDocument();
    expect(screen.getByTestId("kpi-MRR").textContent).toMatch(/1[. ]234/);
  });

  it("formats percent values", () => {
    render(<KPICard label="Churn" value={3.5} format="percent" animate={false} />);
    expect(screen.getByTestId("kpi-Churn").textContent).toMatch(/[34]%/);
  });

  it("shows positive delta", () => {
    render(<KPICard label="X" value={100} delta={12.5} animate={false} />);
    expect(screen.getByText(/\+12\.5%/)).toBeInTheDocument();
  });

  it("shows negative delta", () => {
    render(<KPICard label="Y" value={100} delta={-3.2} animate={false} />);
    expect(screen.getByText(/-3\.2%/)).toBeInTheDocument();
  });
});

describe("LineChart", () => {
  it("renders one point per data entry", () => {
    const data = [
      { label: "A", value: 100 },
      { label: "B", value: 200 },
      { label: "C", value: 150 },
    ];
    render(<LineChart data={data} title="Test" />);
    expect(screen.getAllByTestId("line-point")).toHaveLength(3);
    expect(screen.getByTestId("line-path")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<LineChart data={[{ label: "X", value: 1 }, { label: "Y", value: 2 }]} title="My Trend" />);
    expect(screen.getByText("My Trend")).toBeInTheDocument();
  });
});

describe("BarChart", () => {
  it("renders one bar per item", () => {
    const data = [
      { label: "Engleză", value: 100 },
      { label: "Pian", value: 50 },
    ];
    render(<BarChart data={data} title="Revenue" />);
    expect(screen.getAllByTestId("bar-fill")).toHaveLength(2);
    expect(screen.getByText("Engleză")).toBeInTheDocument();
  });

  it("computes percentage correctly", () => {
    const data = [
      { label: "A", value: 75 },
      { label: "B", value: 25 },
    ];
    render(<BarChart data={data} title="T" />);
    expect(screen.getByText(/\(75%\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(25%\)/)).toBeInTheDocument();
  });
});

describe("RapoartePage", () => {
  it("renders hero", () => {
    render(<HashRouter><RapoartePage /></HashRouter>);
    expect(screen.getByText(/Modulul Rapoarte/i)).toBeInTheDocument();
  });

  it("renders all 4 KPI cards", () => {
    render(<HashRouter><RapoartePage /></HashRouter>);
    expect(screen.getByTestId("kpi-MRR")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Elevi activi")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-LTV mediu")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Churn rate")).toBeInTheDocument();
  });

  it("renders Top 5 students table", () => {
    render(<HashRouter><RapoartePage /></HashRouter>);
    expect(screen.getByText(/Top 5 elevi după LTV/i)).toBeInTheDocument();
    expect(screen.getByText(/Maria Popescu/i)).toBeInTheDocument();
  });

  it("changes period when toggle clicked", () => {
    render(<HashRouter><RapoartePage /></HashRouter>);
    const tab90 = screen.getByRole("tab", { name: /90 zile/i });
    fireEvent.click(tab90);
    expect(tab90).toHaveAttribute("aria-selected", "true");
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><RapoartePage /></HashRouter>);
    expect(screen.getByText(/De unde vin datele/i)).toBeInTheDocument();
  });
});
