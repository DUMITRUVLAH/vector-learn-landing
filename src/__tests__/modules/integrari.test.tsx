import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntegrationCard } from "@/components/modules/integrari/IntegrationCard";
import { IntegrationModal } from "@/components/modules/integrari/IntegrationModal";
import { IntegrariPage, filterIntegrations } from "@/pages/modules/IntegrariPage";
import { INTEGRATIONS, type Integration } from "@/data/integrations";
import { HashRouter } from "@/router/HashRouter";

describe("filterIntegrations", () => {
  it("returns all when query empty and category 'all'", () => {
    expect(filterIntegrations(INTEGRATIONS, "", "all")).toHaveLength(INTEGRATIONS.length);
  });

  it("filters by category", () => {
    const result = filterIntegrations(INTEGRATIONS, "", "telefonie");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((i) => i.category === "telefonie")).toBe(true);
  });

  it("filters by query on name (case-insensitive)", () => {
    const result = filterIntegrations(INTEGRATIONS, "stripe", "all");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((i) => i.name.toLowerCase().includes("stripe"))).toBe(true);
  });

  it("filters by query on description", () => {
    const result = filterIntegrations(INTEGRATIONS, "anaf", "all");
    expect(result.length).toBeGreaterThan(0);
  });

  it("combines query + category filter", () => {
    const result = filterIntegrations(INTEGRATIONS, "stripe", "plati");
    expect(result.every((i) => i.category === "plati")).toBe(true);
  });

  it("returns empty when nothing matches", () => {
    expect(filterIntegrations(INTEGRATIONS, "xyz-nothing", "all")).toHaveLength(0);
  });
});

const sampleInt: Integration = INTEGRATIONS[0];

describe("IntegrationCard", () => {
  it("renders name and category", () => {
    render(<IntegrationCard integration={sampleInt} />);
    expect(screen.getByText(sampleInt.name)).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    let clicked: Integration | null = null;
    render(<IntegrationCard integration={sampleInt} onClick={(i) => (clicked = i)} />);
    fireEvent.click(screen.getByTestId(`int-card-${sampleInt.id}`));
    expect(clicked).toBe(sampleInt);
  });

  it("shows popular badge when applicable", () => {
    const popular = INTEGRATIONS.find((i) => i.popular)!;
    render(<IntegrationCard integration={popular} />);
    expect(screen.getByText(/Popular/i)).toBeInTheDocument();
  });
});

describe("IntegrationModal", () => {
  it("returns null when integration is null", () => {
    const { container } = render(<IntegrationModal integration={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders when integration provided", () => {
    render(<IntegrationModal integration={sampleInt} onClose={() => {}} />);
    expect(screen.getByTestId("integration-modal")).toBeInTheDocument();
    expect(screen.getByText(sampleInt.name)).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    let closed = false;
    render(<IntegrationModal integration={sampleInt} onClose={() => (closed = true)} />);
    fireEvent.click(screen.getByLabelText(/Închide modal/i));
    expect(closed).toBe(true);
  });
});

describe("IntegrariPage", () => {
  it("renders hero", () => {
    render(<HashRouter><IntegrariPage /></HashRouter>);
    expect(screen.getByText(/Modulul Integrări/i)).toBeInTheDocument();
  });

  it("renders 32 integration cards by default", () => {
    render(<HashRouter><IntegrariPage /></HashRouter>);
    expect(screen.getByTestId("int-count").textContent).toMatch(/\d+ integrări/);
  });

  it("filters when search query changes", () => {
    render(<HashRouter><IntegrariPage /></HashRouter>);
    const input = screen.getByLabelText(/Caută integrări/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stripe" } });
    expect(screen.getByTestId("int-count").textContent).toMatch(/1 integrări/);
  });

  it("opens modal on card click", () => {
    render(<HashRouter><IntegrariPage /></HashRouter>);
    fireEvent.click(screen.getByTestId("int-card-stripe"));
    expect(screen.getByTestId("integration-modal")).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><IntegrariPage /></HashRouter>);
    expect(screen.getByText(/Pot conecta o aplicație/i)).toBeInTheDocument();
  });
});
