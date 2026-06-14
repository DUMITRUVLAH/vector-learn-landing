/**
 * SPLIT-101 — BusinessShell unit tests
 *
 * T-SPLIT-101-1: render fără crash cu copil
 * T-SPLIT-101-2: redirecționează la /business/login dacă sesiunea lipsește (401)
 * T-SPLIT-101-3: sidebar conține link-urile cheie
 * T-SPLIT-101-4: icoanele din sidebar au aria-hidden
 * T-SPLIT-101-5: dark mode nu aruncă erori de render
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BusinessShell } from "@/components/business/BusinessShell";

// Mock HashRouter
const mockNavigate = vi.fn();
let mockPath = "/business/dashboard";
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: mockPath, navigate: mockNavigate }),
  Link: ({ to, children, className, "aria-label": ariaLabel, "aria-current": ariaCurrent }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
    "aria-current"?: string;
  }) => (
    <a href={`#${to}`} className={className} aria-label={ariaLabel} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

// Mock NotificationBell
vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <button aria-label="Notificări" />,
}));

// Mock useBusinessSession — factory returs fresh mock each call;
// overridden per-test via mockBusinessSession variable.
let mockBusinessSessionStatus: "loading" | "authenticated" | "unauthenticated" | "error" = "authenticated";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: mockBusinessSessionStatus,
    data:
      mockBusinessSessionStatus === "authenticated"
        ? {
            user: { id: "u1", email: "a@b.com", name: "Admin", role: "admin" },
            tenant: { id: "t1", name: "Demo Business", slug: "demo-business-suite", appKind: "business" as const },
          }
        : null,
    error: null,
    refresh: vi.fn(),
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockPath = "/business/dashboard";
  mockBusinessSessionStatus = "authenticated";
});

describe("SPLIT-101 — BusinessShell", () => {
  // T-SPLIT-101-1
  it("T-SPLIT-101-1 [blocant] randează fără crash și afișează copilul", () => {
    render(
      <BusinessShell pageTitle="Test Shell">
        <p>content</p>
      </BusinessShell>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.getByText("Test Shell")).toBeInTheDocument();
  });

  // T-SPLIT-101-2
  it("T-SPLIT-101-2 [blocant] redirecționează la /business/login dacă sesiunea e invalidă", async () => {
    mockBusinessSessionStatus = "unauthenticated";
    render(
      <BusinessShell pageTitle="Guard Test">
        <p>protected</p>
      </BusinessShell>
    );
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/business/login");
    });
  });

  // T-SPLIT-101-3
  it("T-SPLIT-101-3 [normal] sidebar conține link-urile cheie", () => {
    render(
      <BusinessShell pageTitle="Nav Test">
        <></>
      </BusinessShell>
    );
    // Verifică link-uri prin href
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href") || "");
    expect(hrefs.some((h) => h.includes("/business/dashboard"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/business/fin"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/business/par"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/business/itpark"))).toBe(true);
  });

  // T-SPLIT-101-4
  it("T-SPLIT-101-4 [normal] icoanele SVG din sidebar au aria-hidden=true", () => {
    render(
      <BusinessShell pageTitle="A11y Test">
        <></>
      </BusinessShell>
    );
    const svgs = document.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // T-SPLIT-101-5
  it("T-SPLIT-101-5 [normal] dark mode nu aruncă erori de render", () => {
    document.documentElement.classList.add("dark");
    expect(() => {
      render(
        <BusinessShell pageTitle="Dark Test">
          <p>dark content</p>
        </BusinessShell>
      );
    }).not.toThrow();
    document.documentElement.classList.remove("dark");
  });
});
