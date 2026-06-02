/**
 * AI-A02 — ChurnWidget UI tests (T-AI-A02-5, T-AI-A02-6)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChurnWidget } from "../../components/app/ChurnWidget";

// Mock useRouter so Link doesn't crash
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
  useRouter: () => ({ navigate: vi.fn(), path: "/app/dashboard" }),
}));

const mockScores = [
  {
    id: "1",
    studentId: "stu-001",
    score: 75,
    factors: ["3 absențe în ultimele 14 zile"],
    trend: "rising" as const,
    suggestedAction: "Contactați părintele.",
    scoredAt: new Date().toISOString(),
  },
  {
    id: "2",
    studentId: "stu-002",
    score: 55,
    factors: ["Nicio lecție programată"],
    trend: "stable" as const,
    suggestedAction: null,
    scoredAt: new Date().toISOString(),
  },
];

describe("ChurnWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-AI-A02-5: renders nothing when scores are empty", () => {
    const { container } = render(<ChurnWidget scores={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("T-AI-A02-5: renders scores with badges when data present", () => {
    render(<ChurnWidget scores={mockScores} />);
    expect(screen.getByText("Risc abandonare")).toBeInTheDocument();
    // Score badges
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
  });

  it("T-AI-A02-5: shows red badge for high risk (>=70)", () => {
    render(<ChurnWidget scores={mockScores} />);
    const badge = screen.getByText("75%");
    // Should have destructive color class
    expect(badge.className).toContain("text-destructive");
  });

  it("T-AI-A02-5: shows amber badge for medium risk (50-69)", () => {
    render(<ChurnWidget scores={mockScores} />);
    const badge = screen.getByText("55%");
    expect(badge.className).toContain("amber");
  });

  it("renders 'Vezi toți' link pointing to churn analytics", () => {
    render(<ChurnWidget scores={mockScores} />);
    const link = screen.getByRole("link", { name: /vezi toți/i });
    expect(link.getAttribute("href")).toContain("/app/analytics/churn");
  });

  it("shows first factor text for each student", () => {
    render(<ChurnWidget scores={mockScores} />);
    expect(screen.getByText("3 absențe în ultimele 14 zile")).toBeInTheDocument();
    expect(screen.getByText("Nicio lecție programată")).toBeInTheDocument();
  });
});
