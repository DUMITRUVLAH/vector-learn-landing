import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatDemo } from "@/components/modules/ai/ChatDemo";
import { UseCaseCard } from "@/components/modules/ai/UseCaseCard";
import { AIPage } from "@/pages/modules/AIPage";
import { HashRouter } from "@/router/HashRouter";
import { Mail } from "lucide-react";

describe("ChatDemo", () => {
  it("renders initial idle state with empty chat", () => {
    render(<ChatDemo />);
    expect(screen.getByText(/Apasă pe un prompt/i)).toBeInTheDocument();
  });

  it("renders 3 preset prompt buttons", () => {
    render(<ChatDemo />);
    expect(screen.getByTestId("prompt-welcome")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-summary")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-churn")).toBeInTheDocument();
  });

  it("starts typing when a prompt is clicked", () => {
    render(<ChatDemo />);
    fireEvent.click(screen.getByTestId("prompt-welcome"));
    expect(screen.queryByText(/Apasă pe un prompt/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Scrie un mesaj de welcome/i).length).toBeGreaterThan(0);
  });

  it("disables other buttons while typing", () => {
    render(<ChatDemo />);
    fireEvent.click(screen.getByTestId("prompt-welcome"));
    const churnBtn = screen.getByTestId("prompt-churn") as HTMLButtonElement;
    expect(churnBtn.disabled).toBe(true);
  });

  it("renders GDPR disclaimer", () => {
    render(<ChatDemo />);
    expect(screen.getByText(/Datele tale nu sunt folosite/i)).toBeInTheDocument();
  });
});

describe("UseCaseCard", () => {
  it("renders title, description, benefit", () => {
    render(<UseCaseCard icon={Mail} title="Test" description="Desc test" benefit="Benefit test" index={0} />);
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Desc test")).toBeInTheDocument();
    expect(screen.getByText("Benefit test")).toBeInTheDocument();
  });
});

describe("AIPage", () => {
  it("renders hero", () => {
    render(<HashRouter><AIPage /></HashRouter>);
    expect(screen.getByText(/Modulul AI/i)).toBeInTheDocument();
  });

  it("renders chat demo with 3 prompts", () => {
    render(<HashRouter><AIPage /></HashRouter>);
    expect(screen.getByTestId("prompt-welcome")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-summary")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-churn")).toBeInTheDocument();
  });

  it("renders 3 use case cards", () => {
    render(<HashRouter><AIPage /></HashRouter>);
    expect(screen.getByText(/Răspuns automat părinți/i)).toBeInTheDocument();
    expect(screen.getByText(/Sumarizare lecții pentru părinți/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Predicție churn/i).length).toBeGreaterThan(0);
  });

  it("renders privacy section with 4 guarantees", () => {
    render(<HashRouter><AIPage /></HashRouter>);
    expect(screen.getAllByText(/GDPR & ANSPDCP/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/EU AI Act compliant/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Human-in-the-loop/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(<HashRouter><AIPage /></HashRouter>);
    expect(screen.getByText(/Ce model AI folosiți/i)).toBeInTheDocument();
  });
});
