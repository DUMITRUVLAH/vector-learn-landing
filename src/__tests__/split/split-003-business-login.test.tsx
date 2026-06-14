/**
 * SPLIT-003: BusinessLoginPage render test
 * T-SPLIT-003-4 [blocant] — render without crash, form visible
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the router so we can render without full HashRouter setup
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/business/login" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

import { BusinessLoginPage } from "../../pages/business/BusinessLoginPage";

describe("SPLIT-003 — BusinessLoginPage", () => {
  it("T-SPLIT-003-4 [blocant] renders without crash", () => {
    expect(() => render(<BusinessLoginPage />)).not.toThrow();
  });

  it("renders login form with email + password fields", () => {
    render(<BusinessLoginPage />);
    expect(screen.getByLabelText(/Email/i)).toBeDefined();
    expect(screen.getByLabelText(/Parolă/i)).toBeDefined();
  });

  it("has submit button with business label", () => {
    render(<BusinessLoginPage />);
    expect(screen.getByRole("button", { name: /Conectare Business Suite/i })).toBeDefined();
  });

  it("pre-fills demo credentials", () => {
    render(<BusinessLoginPage />);
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("admin@demo.business.io");
  });

  it("shows link back to CRM login", () => {
    render(<BusinessLoginPage />);
    expect(screen.getByText(/Login CRM/i)).toBeDefined();
  });
});
