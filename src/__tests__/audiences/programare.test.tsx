import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramarePage } from "@/pages/audiences/ProgramarePage";
import { HashRouter } from "@/router/HashRouter";

describe("ProgramarePage", () => {
  it("renders hero with audience badge", () => {
    render(<HashRouter><ProgramarePage /></HashRouter>);
    expect(screen.getByText(/Pentru școli de programare/i)).toBeInTheDocument();
  });

  it("renders 5 pain/solution items", () => {
    render(<HashRouter><ProgramarePage /></HashRouter>);
    expect(screen.getAllByTestId("pain-solution-item")).toHaveLength(5);
  });

  it("renders skill tree visual with HTML/CSS at level 1", () => {
    render(<HashRouter><ProgramarePage /></HashRouter>);
    expect(screen.getByText(/HTML\/CSS/i)).toBeInTheDocument();
  });

  it("renders case study with CodeNation", () => {
    render(<HashRouter><ProgramarePage /></HashRouter>);
    expect(screen.getByText(/CodeNation/i)).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><ProgramarePage /></HashRouter>);
    expect(screen.getByText(/Cum funcționează integrarea cu GitHub/i)).toBeInTheDocument();
  });
});
