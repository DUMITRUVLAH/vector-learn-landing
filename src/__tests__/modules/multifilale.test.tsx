import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RomaniaMap, type Branch } from "@/components/modules/multifilale/RomaniaMap";
import {
  BranchSwitcher,
  BranchKPIBar,
  aggregateKPIs,
} from "@/components/modules/multifilale/BranchSwitcher";
import { MultifilalePage } from "@/pages/modules/MultifilalePage";
import { HashRouter } from "@/router/HashRouter";

const sample: Branch[] = [
  { id: "a", city: "A", x: 0, y: 0, students: 100, teachers: 10, monthlyRevenue: 5000, satisfaction: 4.5 },
  { id: "b", city: "B", x: 0, y: 0, students: 200, teachers: 15, monthlyRevenue: 8000, satisfaction: 4.7 },
];

describe("aggregateKPIs", () => {
  it("sums all branches when selectedId is null", () => {
    const r = aggregateKPIs(sample, null);
    expect(r.students).toBe(300);
    expect(r.teachers).toBe(25);
    expect(r.monthlyRevenue).toBe(13000);
    expect(r.satisfaction).toBeCloseTo(4.6, 1);
  });

  it("returns single branch values when selected", () => {
    const r = aggregateKPIs(sample, "a");
    expect(r.students).toBe(100);
    expect(r.satisfaction).toBe(4.5);
  });

  it("returns zeros for empty branches", () => {
    const r = aggregateKPIs([], null);
    expect(r.students).toBe(0);
    expect(r.satisfaction).toBe(0);
  });

  it("returns aggregate when selectedId doesn't match", () => {
    const r = aggregateKPIs(sample, "ghost");
    expect(r.students).toBe(300);
  });
});

describe("RomaniaMap", () => {
  it("renders one pin per branch", () => {
    render(<RomaniaMap branches={sample} />);
    expect(screen.getByTestId("pin-a")).toBeInTheDocument();
    expect(screen.getByTestId("pin-b")).toBeInTheDocument();
  });

  it("renders map svg with role=img", () => {
    render(<RomaniaMap branches={sample} />);
    expect(screen.getByTestId("ro-map")).toBeInTheDocument();
  });
});

describe("BranchSwitcher", () => {
  it("opens dropdown on click", () => {
    let selected: string | null = null;
    render(<BranchSwitcher branches={sample} selectedId={null} onChange={(id) => (selected = id)} />);
    fireEvent.click(screen.getByRole("button", { name: /Toate filialele/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    void selected;
  });

  it("calls onChange when a branch is selected", () => {
    let received: string | null | undefined;
    render(<BranchSwitcher branches={sample} selectedId={null} onChange={(id) => (received = id)} />);
    fireEvent.click(screen.getByRole("button", { name: /Toate filialele/i }));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(received).toBe("a");
  });
});

describe("BranchKPIBar", () => {
  it("renders all 4 KPI cards", () => {
    const kpis = aggregateKPIs(sample, null);
    render(<BranchKPIBar kpis={kpis} />);
    expect(screen.getByTestId("kpi-Elevi")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Profesori")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Venit lună")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Satisfacție")).toBeInTheDocument();
  });
});

describe("MultifilalePage", () => {
  it("renders hero", () => {
    render(<HashRouter><MultifilalePage /></HashRouter>);
    expect(screen.getByText(/Modulul Multi-filiale/i)).toBeInTheDocument();
  });

  it("renders the map and KPI bar", () => {
    render(<HashRouter><MultifilalePage /></HashRouter>);
    expect(screen.getByTestId("ro-map")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-Elevi")).toBeInTheDocument();
  });

  it("renders 4 sections", () => {
    render(<HashRouter><MultifilalePage /></HashRouter>);
    expect(screen.getByText(/Branding per filială/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Rapoarte consolidate/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Roluri pe filială/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Contracte franciză/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><MultifilalePage /></HashRouter>);
    expect(screen.getByText(/Cât de complicat e să adaug o filială/i)).toBeInTheDocument();
  });
});
