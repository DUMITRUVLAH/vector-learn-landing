import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExamenePage } from "@/pages/audiences/ExamenePage";
import { HashRouter } from "@/router/HashRouter";

describe("ExamenePage", () => {
  it("renders hero", () => {
    render(<HashRouter><ExamenePage /></HashRouter>);
    expect(screen.getAllByText(/Pentru centre de pregătire examene/i).length).toBeGreaterThan(0);
  });

  it("renders 5 pain/solution items", () => {
    render(<HashRouter><ExamenePage /></HashRouter>);
    expect(screen.getAllByTestId("pain-solution-item")).toHaveLength(5);
  });

  it("renders BAC countdown visual", () => {
    render(<HashRouter><ExamenePage /></HashRouter>);
    expect(screen.getByText(/BAC 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/28 zile/i)).toBeInTheDocument();
  });

  it("renders case study Excelența", () => {
    render(<HashRouter><ExamenePage /></HashRouter>);
    expect(screen.getByText(/Excelența/i)).toBeInTheDocument();
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><ExamenePage /></HashRouter>);
    expect(screen.getByText(/Suportă diferite tipuri de examene/i)).toBeInTheDocument();
  });
});
