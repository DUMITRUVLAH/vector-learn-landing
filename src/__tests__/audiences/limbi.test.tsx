import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LimbiPage } from "@/pages/audiences/LimbiPage";
import { HashRouter } from "@/router/HashRouter";

describe("LimbiPage", () => {
  it("renders hero with audience badge", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getByText(/Pentru centre de limbi străine/i)).toBeInTheDocument();
  });

  it("renders 6 pain/solution items", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getAllByTestId("pain-solution-item")).toHaveLength(6);
  });

  it("renders CEFR levels in hero visual", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getAllByText(/A1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/C2/).length).toBeGreaterThan(0);
  });

  it("renders case study with center name and metrics", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getByText(/Forum/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1\.400/).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getByText(/Suportă niveluri CEFR/i)).toBeInTheDocument();
  });

  it("renders 4 module shortcut cards at bottom", () => {
    render(<HashRouter><LimbiPage /></HashRouter>);
    expect(screen.getAllByText(/Orar pe niveluri/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rapoarte CEFR/i).length).toBeGreaterThan(0);
  });
});
