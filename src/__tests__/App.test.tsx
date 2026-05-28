import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "@/App";

describe("App", () => {
  it("renders the navbar logo", () => {
    render(<App />);
    expect(screen.getAllByText(/Vector/i)[0]).toBeInTheDocument();
  });

  it("renders the hero CTA", () => {
    render(<App />);
    expect(screen.getAllByText(/Cere demo gratuit/i)[0]).toBeInTheDocument();
  });

  it("renders all 10 feature cards", () => {
    render(<App />);
    expect(screen.getAllByText(/Orar interactiv/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Finanțe complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/AI Assistant/i)[0]).toBeInTheDocument();
  });

  it("renders the pricing section", () => {
    render(<App />);
    expect(screen.getAllByText(/Starter/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Enterprise/i)[0]).toBeInTheDocument();
  });

  it("renders FAQ section", () => {
    render(<App />);
    expect(
      screen.getByText(/Cât durează implementarea Vector Learn/i)
    ).toBeInTheDocument();
  });
});
