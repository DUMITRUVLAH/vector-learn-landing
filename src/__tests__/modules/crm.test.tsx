import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  KanbanBoard,
  moveLead,
  countByStage,
  type Lead,
} from "@/components/modules/crm/KanbanBoard";
import {
  ConversionCalculator,
  calculateConversion,
} from "@/components/modules/crm/ConversionCalculator";
import { SourcePieChart } from "@/components/modules/crm/SourcePieChart";
import { CRMPage } from "@/pages/modules/CRMPage";
import { HashRouter } from "@/router/HashRouter";

const sample: Lead[] = [
  { id: "A", name: "Ana", course: "X", source: "site", daysInStage: 0, stage: "new" },
  { id: "B", name: "Bogdan", course: "X", source: "site", daysInStage: 0, stage: "new" },
  { id: "C", name: "Cătălin", course: "X", source: "site", daysInStage: 0, stage: "trial" },
  { id: "D", name: "Diana", course: "X", source: "site", daysInStage: 0, stage: "paid", value: 200 },
];

describe("moveLead", () => {
  it("moves a lead to a new stage", () => {
    const result = moveLead(sample, "A", "trial");
    expect(result.find((l) => l.id === "A")?.stage).toBe("trial");
  });

  it("resets daysInStage on move", () => {
    const withDays = [{ ...sample[0], daysInStage: 10 }];
    const result = moveLead(withDays, "A", "paid");
    expect(result[0].daysInStage).toBe(0);
  });

  it("leaves other leads untouched", () => {
    const result = moveLead(sample, "A", "lost");
    expect(result.find((l) => l.id === "B")?.stage).toBe("new");
    expect(result.find((l) => l.id === "C")?.stage).toBe("trial");
  });

  it("returns same array if lead id not found", () => {
    const result = moveLead(sample, "ZZZ", "lost");
    expect(result).toHaveLength(sample.length);
    expect(result.every((l, i) => l.stage === sample[i].stage)).toBe(true);
  });
});

describe("countByStage", () => {
  it("counts leads per stage", () => {
    const counts = countByStage(sample);
    expect(counts.new).toBe(2);
    expect(counts.trial).toBe(1);
    expect(counts.paid).toBe(1);
    expect(counts.lost).toBe(0);
  });

  it("returns all zeros for empty input", () => {
    const counts = countByStage([]);
    expect(counts.new).toBe(0);
    expect(counts.trial).toBe(0);
    expect(counts.paid).toBe(0);
    expect(counts.lost).toBe(0);
  });
});

describe("KanbanBoard", () => {
  it("renders all 4 columns", () => {
    render(<KanbanBoard />);
    expect(screen.getByText(/Lead nou/i)).toBeInTheDocument();
    expect(screen.getByText(/Trial \/ Demo/i)).toBeInTheDocument();
    expect(screen.getByText(/Client plătitor/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pierdut/i).length).toBeGreaterThan(0);
  });

  it("renders at least one draggable lead card", () => {
    render(<KanbanBoard />);
    const cards = screen.getAllByRole("button", { name: /Lead /i });
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((c) => expect(c).toHaveAttribute("draggable", "true"));
  });
});

describe("calculateConversion", () => {
  it("computes trials = leads * leadToTrialRate / 100", () => {
    const r = calculateConversion({ leadsPerMonth: 100, leadToTrialRate: 50, trialToPaidRate: 40, avgMonthlyValue: 200 });
    expect(r.trials).toBe(50);
  });

  it("computes newPaying = trials * trialToPaidRate / 100", () => {
    const r = calculateConversion({ leadsPerMonth: 100, leadToTrialRate: 50, trialToPaidRate: 40, avgMonthlyValue: 200 });
    expect(r.newPaying).toBe(20);
  });

  it("computes newMRR = newPaying * avgMonthlyValue", () => {
    const r = calculateConversion({ leadsPerMonth: 100, leadToTrialRate: 50, trialToPaidRate: 40, avgMonthlyValue: 200 });
    expect(r.newMRR).toBe(20 * 200);
  });

  it("handles zero leads without dividing by zero", () => {
    const r = calculateConversion({ leadsPerMonth: 0, leadToTrialRate: 50, trialToPaidRate: 40, avgMonthlyValue: 200 }, 100);
    expect(r.costPerLead).toBe(0);
    expect(r.cac).toBe(0);
  });
});

describe("ConversionCalculator", () => {
  it("renders default outputs", () => {
    render(<ConversionCalculator />);
    expect(screen.getByTestId("conv-mrr")).toBeInTheDocument();
    expect(screen.getByTestId("conv-trials")).toBeInTheDocument();
    expect(screen.getByTestId("conv-paying")).toBeInTheDocument();
  });

  it("recalculates when leads slider changes", () => {
    render(<ConversionCalculator />);
    const slider = screen.getByLabelText(/Leaduri pe lună/i) as HTMLInputElement;
    const before = screen.getByTestId("conv-mrr").textContent;
    fireEvent.change(slider, { target: { value: "300" } });
    expect(screen.getByTestId("conv-mrr").textContent).not.toBe(before);
  });
});

describe("SourcePieChart", () => {
  it("renders the configured number of slices", () => {
    render(<SourcePieChart />);
    const slices = screen.getAllByTestId("pie-slice");
    expect(slices).toHaveLength(5);
  });

  it("renders custom data with correct slice count", () => {
    render(
      <SourcePieChart
        data={[
          { label: "X", value: 50, color: "hsl(0,0%,50%)" },
          { label: "Y", value: 30, color: "hsl(0,0%,30%)" },
          { label: "Z", value: 20, color: "hsl(0,0%,20%)" },
        ]}
      />
    );
    expect(screen.getAllByTestId("pie-slice")).toHaveLength(3);
  });
});

describe("CRMPage", () => {
  it("renders hero with module badge", () => {
    render(
      <HashRouter>
        <CRMPage />
      </HashRouter>
    );
    expect(screen.getByText(/Modulul CRM/i)).toBeInTheDocument();
  });

  it("renders the kanban board with leads", () => {
    render(
      <HashRouter>
        <CRMPage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Lead nou/i).length).toBeGreaterThan(0);
  });

  it("renders the conversion calculator", () => {
    render(
      <HashRouter>
        <CRMPage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Calculator conversie leaduri/i).length).toBeGreaterThan(0);
  });

  it("renders 4 main sections", () => {
    render(
      <HashRouter>
        <CRMPage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Pipeline vizual kanban/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Automatizări fără cod/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Atribuire UTM/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Telefonie/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(
      <HashRouter>
        <CRMPage />
      </HashRouter>
    );
    expect(screen.getByText(/Pot importa leaduri vechi/i)).toBeInTheDocument();
  });
});
