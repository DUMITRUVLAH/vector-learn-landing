import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  PricingWizard,
  recommendPlan,
  type WizardAnswers,
} from "@/components/tools/PricingWizard";
import { PricingConfiguratorPage } from "@/pages/tools/PricingConfiguratorPage";
import { HashRouter } from "@/router/HashRouter";

describe("recommendPlan", () => {
  it("recommends starter for smallest setup", () => {
    const answers: WizardAnswers = {
      studentBucket: "small",
      branches: "one",
      integrations: "basic",
      whiteLabel: false,
      aiUsage: "none",
    };
    expect(recommendPlan(answers)).toBe("starter");
  });

  it("recommends growth for medium scale", () => {
    const answers: WizardAnswers = {
      studentBucket: "medium",
      branches: "one",
      integrations: "basic",
      whiteLabel: false,
      aiUsage: "light",
    };
    expect(recommendPlan(answers)).toBe("growth");
  });

  it("recommends pro when white-label is needed", () => {
    const answers: WizardAnswers = {
      studentBucket: "medium",
      branches: "one",
      integrations: "basic",
      whiteLabel: true,
      aiUsage: "none",
    };
    expect(recommendPlan(answers)).toBe("pro");
  });

  it("recommends enterprise for xlarge or heavy AI or many branches", () => {
    expect(
      recommendPlan({
        studentBucket: "xlarge",
        branches: "one",
        integrations: "basic",
        whiteLabel: false,
        aiUsage: "none",
      })
    ).toBe("enterprise");
    expect(
      recommendPlan({
        studentBucket: "small",
        branches: "many",
        integrations: "basic",
        whiteLabel: false,
        aiUsage: "none",
      })
    ).toBe("enterprise");
    expect(
      recommendPlan({
        studentBucket: "small",
        branches: "one",
        integrations: "basic",
        whiteLabel: false,
        aiUsage: "heavy",
      })
    ).toBe("enterprise");
  });
});

describe("PricingWizard", () => {
  it("starts at step 1 with progress bar visible", () => {
    render(<PricingWizard onComplete={() => {}} />);
    expect(screen.getByText(/Pas 1 din 5/i)).toBeInTheDocument();
    expect(screen.getByTestId("wizard-progress")).toBeInTheDocument();
  });

  it("disables Next button until answer selected", () => {
    render(<PricingWizard onComplete={() => {}} />);
    const next = screen.getByTestId("wizard-next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("wizard-studentBucket-medium"));
    expect(next.disabled).toBe(false);
  });

  it("advances through steps when Next clicked", () => {
    render(<PricingWizard onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId("wizard-studentBucket-medium"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(screen.getByText(/Pas 2 din 5/i)).toBeInTheDocument();
  });

  it("calls onComplete with plan + answers at end", () => {
    let received: { plan: string; answers: WizardAnswers } | null = null;
    render(
      <PricingWizard
        onComplete={(plan, answers) => {
          received = { plan, answers };
        }}
      />
    );
    fireEvent.click(screen.getByTestId("wizard-studentBucket-medium"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-branches-one"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-integrations-basic"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-aiUsage-light"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(received).not.toBeNull();
    expect(received!.plan).toBe("growth");
  });
});

describe("PricingConfiguratorPage", () => {
  it("renders wizard initially", () => {
    render(<HashRouter><PricingConfiguratorPage /></HashRouter>);
    expect(screen.getByText(/Câți elevi activi/i)).toBeInTheDocument();
  });

  it("renders currency + yearly/lunar toggles", () => {
    render(<HashRouter><PricingConfiguratorPage /></HashRouter>);
    expect(screen.getByRole("tab", { name: /RON/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Anual/i })).toBeInTheDocument();
  });

  it("shows recommendation after completing wizard", () => {
    render(<HashRouter><PricingConfiguratorPage /></HashRouter>);
    fireEvent.click(screen.getByTestId("wizard-studentBucket-small"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-branches-one"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-integrations-basic"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-aiUsage-none"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("plan-recommended")).toBeInTheDocument();
    expect(screen.getByTestId("plan-starter")).toBeInTheDocument();
  });
});
