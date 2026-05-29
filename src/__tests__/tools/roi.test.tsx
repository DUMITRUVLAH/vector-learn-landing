import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ROICalculatorPage, calculateROI } from "@/pages/tools/ROICalculatorPage";
import { HashRouter } from "@/router/HashRouter";

describe("calculateROI", () => {
  const baseInputs = {
    students: 200,
    teachers: 12,
    avgMonthlyPrice: 280,
    adminHoursPerWeek: 20,
    noShowRate: 8,
    overdueRate: 15,
    churnRate: 6,
  };

  it("computes positive monthly savings for default inputs", () => {
    const r = calculateROI(baseInputs);
    expect(r.totalMonthly).toBeGreaterThan(0);
    expect(r.totalAnnual).toBe(r.totalMonthly * 12);
  });

  it("computes hours recovered = adminHours * 0.7 * 4", () => {
    const r = calculateROI(baseInputs);
    expect(r.hoursRecovered).toBeCloseTo(20 * 0.7 * 4, 1);
  });

  it("clamps negative inputs to 0", () => {
    const r = calculateROI({ ...baseInputs, students: -10 });
    expect(r.monthlyRevenue).toBe(0);
  });

  it("scales Vector Learn cost by teacher tier", () => {
    const small = calculateROI({ ...baseInputs, teachers: 5 });
    const medium = calculateROI({ ...baseInputs, teachers: 20 });
    const large = calculateROI({ ...baseInputs, teachers: 50 });
    expect(small.vectorLearnCost).toBe(29);
    expect(medium.vectorLearnCost).toBe(69);
    expect(large.vectorLearnCost).toBe(149);
  });

  it("returns short payback when savings high relative to cost", () => {
    const r = calculateROI(baseInputs);
    expect(r.paybackMonths).toBeLessThan(5);
  });
});

describe("ROICalculatorPage", () => {
  it("renders page with all KPI cards", () => {
    render(<HashRouter><ROICalculatorPage /></HashRouter>);
    expect(screen.getByTestId("roi-monthly")).toBeInTheDocument();
    expect(screen.getByTestId("roi-hours")).toBeInTheDocument();
    expect(screen.getByTestId("roi-payback")).toBeInTheDocument();
  });

  it("updates output when slider changes", () => {
    render(<HashRouter><ROICalculatorPage /></HashRouter>);
    const slider = screen.getByLabelText(/Elevi activi/i) as HTMLInputElement;
    const before = screen.getByTestId("roi-monthly").textContent;
    fireEvent.change(slider, { target: { value: "1000" } });
    expect(screen.getByTestId("roi-monthly").textContent).not.toBe(before);
  });

  it("toggles currency RON ↔ EUR", () => {
    render(<HashRouter><ROICalculatorPage /></HashRouter>);
    const eurBefore = screen.getByTestId("roi-monthly").textContent;
    fireEvent.click(screen.getByRole("tab", { name: /RON/i }));
    expect(screen.getByTestId("roi-monthly").textContent).not.toBe(eurBefore);
    expect(screen.getByTestId("roi-monthly").textContent).toMatch(/RON|lei/i);
  });

  it("renders email capture form", () => {
    render(<HashRouter><ROICalculatorPage /></HashRouter>);
    expect(screen.getByLabelText(/Email pentru raport/i)).toBeInTheDocument();
  });

  it("shows success message after email submitted", () => {
    render(<HashRouter><ROICalculatorPage /></HashRouter>);
    const emailInput = screen.getByLabelText(/Email pentru raport/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByText(/Trimite raport/i));
    expect(screen.getByText(/Raport PDF trimis/i)).toBeInTheDocument();
  });
});
