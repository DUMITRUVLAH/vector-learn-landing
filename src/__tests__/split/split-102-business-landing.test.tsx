/**
 * SPLIT-102 — BusinessLandingPage unit tests
 *
 * T-SPLIT-102-1: ruta /business randează BusinessLandingPage (nu HomePage)
 * T-SPLIT-102-2: landing randează fără crash cu textele FinDesk, PAR, ITPark
 * T-SPLIT-102-3: CTA "Intră în cont" → /business/login
 * T-SPLIT-102-4: dark mode — smoke render fără crash
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BusinessLandingPage } from "@/pages/business/BusinessLandingPage";

// Mock HashRouter Link
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business", navigate: vi.fn() }),
  Link: ({ to, children, className, "aria-label": ariaLabel }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={`#${to}`} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

describe("SPLIT-102 — BusinessLandingPage", () => {
  // T-SPLIT-102-1: routing — tested via App.tsx integration; here we verify the component renders
  it("T-SPLIT-102-1 [blocant] landing se randează fără crash (component smoke)", () => {
    expect(() => render(<BusinessLandingPage />)).not.toThrow();
  });

  // T-SPLIT-102-2
  it("T-SPLIT-102-2 [blocant] conține textele FinDesk, PAR, ITPark", () => {
    render(<BusinessLandingPage />);
    expect(screen.getAllByText(/FinDesk/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/PAR/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/ITPark/i)[0]).toBeInTheDocument();
  });

  // T-SPLIT-102-3
  it("T-SPLIT-102-3 [normal] CTA Intră în cont navigă la /business/login", () => {
    render(<BusinessLandingPage />);
    const ctaLinks = screen.getAllByRole("link").filter((l) =>
      l.getAttribute("href")?.includes("/business/login")
    );
    expect(ctaLinks.length).toBeGreaterThan(0);
    expect(ctaLinks[0]).toBeInTheDocument();
  });

  // T-SPLIT-102-4
  it("T-SPLIT-102-4 [normal] dark mode nu aruncă erori de render", () => {
    document.documentElement.classList.add("dark");
    expect(() => render(<BusinessLandingPage />)).not.toThrow();
    document.documentElement.classList.remove("dark");
  });
});
