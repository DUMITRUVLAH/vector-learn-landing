import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MuzicaPage } from "@/pages/audiences/MuzicaPage";
import { HashRouter } from "@/router/HashRouter";

describe("MuzicaPage", () => {
  it("renders hero", () => {
    render(<HashRouter><MuzicaPage /></HashRouter>);
    expect(screen.getAllByText(/Pentru școli de muzică/i).length).toBeGreaterThan(0);
  });

  it("renders 5 pain/solution items", () => {
    render(<HashRouter><MuzicaPage /></HashRouter>);
    expect(screen.getAllByTestId("pain-solution-item")).toHaveLength(5);
  });

  it("renders recital visual with Mozart entry", () => {
    render(<HashRouter><MuzicaPage /></HashRouter>);
    expect(screen.getByText(/Mozart/i)).toBeInTheDocument();
  });

  it("renders case study Cantabile", () => {
    render(<HashRouter><MuzicaPage /></HashRouter>);
    expect(screen.getByText(/Cantabile/i)).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><MuzicaPage /></HashRouter>);
    expect(screen.getByText(/pricing diferit pentru pian/i)).toBeInTheDocument();
  });
});
