import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { detectConflicts } from "@/components/modules/orar/ConflictBadge";
import { ScheduleDemo } from "@/components/modules/orar/ScheduleDemo";
import { OrarPage } from "@/pages/modules/OrarPage";
import { HashRouter } from "@/router/HashRouter";

describe("ConflictBadge.detectConflicts", () => {
  it("returns empty when no events share (day, slot)", () => {
    const result = detectConflicts([
      { id: "a", day: 0, slot: 0 },
      { id: "b", day: 1, slot: 0 },
      { id: "c", day: 0, slot: 1 },
    ]);
    expect(result.size).toBe(0);
  });

  it("flags ids that collide on the same (day, slot)", () => {
    const result = detectConflicts([
      { id: "a", day: 0, slot: 0 },
      { id: "b", day: 0, slot: 0 },
      { id: "c", day: 2, slot: 1 },
    ]);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(false);
  });

  it("handles triples on the same slot", () => {
    const result = detectConflicts([
      { id: "a", day: 1, slot: 2 },
      { id: "b", day: 1, slot: 2 },
      { id: "c", day: 1, slot: 2 },
    ]);
    expect(result.size).toBe(3);
  });

  it("returns an empty Set for empty input", () => {
    const result = detectConflicts([]);
    expect(result.size).toBe(0);
  });
});

describe("ScheduleDemo", () => {
  it("renders the 5 days of the week as column headers", () => {
    render(<ScheduleDemo />);
    expect(screen.getByText(/Luni/i)).toBeInTheDocument();
    expect(screen.getByText(/Vineri/i)).toBeInTheDocument();
  });

  it("renders draggable event blocks with role='button'", () => {
    render(<ScheduleDemo />);
    const draggables = screen.getAllByRole("button", { name: /Lecția/i });
    expect(draggables.length).toBeGreaterThan(0);
    draggables.forEach((el) => {
      expect(el).toHaveAttribute("draggable", "true");
    });
  });

  it("renders all four time slots", () => {
    render(<ScheduleDemo />);
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText("14:00")).toBeInTheDocument();
    expect(screen.getByText("16:00")).toBeInTheDocument();
  });
});

describe("OrarPage", () => {
  it("renders the hero with module badge", () => {
    render(
      <HashRouter>
        <OrarPage />
      </HashRouter>
    );
    expect(screen.getByText(/Modulul Orar/i)).toBeInTheDocument();
  });

  it("renders 4 how-it-works steps", () => {
    render(
      <HashRouter>
        <OrarPage />
      </HashRouter>
    );
    expect(screen.getByText(/Definești resursele/i)).toBeInTheDocument();
    expect(screen.getByText(/Ajustezi cu drag & drop/i)).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(
      <HashRouter>
        <OrarPage />
      </HashRouter>
    );
    expect(screen.getByText(/Cât durează să configurez orarul/i)).toBeInTheDocument();
  });

  it("renders capabilities section with 6 cards", () => {
    render(
      <HashRouter>
        <OrarPage />
      </HashRouter>
    );
    expect(screen.getByText(/5 vizualizări simultane/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflict detection/i)).toBeInTheDocument();
  });

  it("renders three target user perspectives", () => {
    render(
      <HashRouter>
        <OrarPage />
      </HashRouter>
    );
    expect(screen.getByText(/Manager academie/i)).toBeInTheDocument();
    expect(screen.getByText(/Director rețea/i)).toBeInTheDocument();
  });
});
