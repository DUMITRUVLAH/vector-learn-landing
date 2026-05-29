import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MigrationEstimatorPage,
  calculateMigration,
} from "@/pages/tools/MigrationEstimatorPage";
import { HashRouter } from "@/router/HashRouter";

describe("calculateMigration", () => {
  const base = {
    source: "hollihop" as const,
    students: 250,
    teachers: 12,
    historyYears: 3,
    whiteGlove: true,
  };

  it("returns 6 phases", () => {
    expect(calculateMigration(base).phases).toHaveLength(6);
  });

  it("totalDays >= sum of phase days", () => {
    const r = calculateMigration(base);
    expect(r.totalDays).toBe(r.phases.reduce((s, p) => s + p.days, 0));
  });

  it("white-glove returns 0 cost", () => {
    const r = calculateMigration({ ...base, whiteGlove: true });
    expect(r.costEUR).toBe(0);
  });

  it("self-service returns positive cost", () => {
    const r = calculateMigration({ ...base, whiteGlove: false });
    expect(r.selfServiceCostEUR).toBeGreaterThan(0);
  });

  it("scales with student count", () => {
    const small = calculateMigration({ ...base, students: 50 });
    const large = calculateMigration({ ...base, students: 2000 });
    expect(large.totalDays).toBeGreaterThan(small.totalDays);
  });

  it("complexity differs per source system", () => {
    const hh = calculateMigration({ ...base, source: "hollihop" });
    const other = calculateMigration({ ...base, source: "other" });
    expect(other.totalDays).toBeGreaterThanOrEqual(hh.totalDays);
  });
});

describe("MigrationEstimatorPage", () => {
  it("renders page with default white-glove cost", () => {
    render(<HashRouter><MigrationEstimatorPage /></HashRouter>);
    expect(screen.getByTestId("migr-cost").textContent).toMatch(/Gratuit/i);
  });

  it("renders 6 phase items in timeline", () => {
    render(<HashRouter><MigrationEstimatorPage /></HashRouter>);
    const list = screen.getByTestId("timeline-phases");
    expect(list.children).toHaveLength(6);
  });

  it("switches to self-service mode with cost", () => {
    render(<HashRouter><MigrationEstimatorPage /></HashRouter>);
    fireEvent.click(screen.getByTestId("mode-self-service"));
    expect(screen.getByTestId("migr-cost").textContent).toMatch(/EUR|€/);
    expect(screen.getByTestId("migr-cost").textContent).not.toMatch(/Gratuit/i);
  });

  it("changes timeline when source system changes", () => {
    render(<HashRouter><MigrationEstimatorPage /></HashRouter>);
    const before = screen.getByTestId("timeline-total").textContent;
    fireEvent.click(screen.getByTestId("source-other"));
    expect(screen.getByTestId("timeline-total").textContent).not.toBe(before);
  });

  it("changes days when students slider changes", () => {
    render(<HashRouter><MigrationEstimatorPage /></HashRouter>);
    const before = screen.getByTestId("migr-days").textContent;
    const slider = screen.getByLabelText(/Elevi în sistemul actual/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "2000" } });
    expect(screen.getByTestId("migr-days").textContent).not.toBe(before);
  });
});
