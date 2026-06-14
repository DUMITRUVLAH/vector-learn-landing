/**
 * SPLIT-301 — AppShell CRM cleanup: no business nav items
 *
 * T-SPLIT-301-1 [blocant] Nav items must not link to /app/fin/, /app/par, /app/itpark
 * T-SPLIT-301-2 [normal]  Secțiunea Finanțe conține entry-urile educaționale
 * T-SPLIT-301-3 [normal]  Business Suite link discreet prezent în sidebar
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app", navigate: vi.fn() }),
  Link: ({
    to,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
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

vi.mock("@/components/Logo", () => ({
  Logo: () => <span>Vector Learn</span>,
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <button aria-label="Notificări" />,
}));

vi.mock("@/components/app/BranchSwitcher", () => ({
  BranchSwitcher: () => null,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "u1", name: "Admin User", role: "admin", email: "admin@test.md" },
      tenant: { id: "t1", name: "Academia Test", slug: "academia-test", institutionType: "scoala" },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/institution", () => ({
  isModuleVisible: () => true,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

import { AppShell } from "@/components/app/AppShell";

describe("SPLIT-301: AppShell CRM cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SPLIT-301-1 [blocant] nicio intrare de nav cu href spre /app/fin/, /app/par, /app/itpark", () => {
    const { container } = render(
      <AppShell pageTitle="Test Page">
        <div>Content</div>
      </AppShell>
    );

    // Collect all anchors and links in the sidebar
    const allLinks = Array.from(container.querySelectorAll("a, [role='link']"));
    const hrefs = allLinks.map((el) => el.getAttribute("href") ?? "");

    // No link should point to business module routes via /app/*
    const businessInAppRoutes = hrefs.filter(
      (href) =>
        href.includes("/app/fin/") ||
        href.includes("/app/par") ||
        href.includes("/app/itpark")
    );

    expect(businessInAppRoutes).toHaveLength(0);
  });

  it("T-SPLIT-301-2 [normal] secțiunea Finanțe conține entry-urile educaționale (Plăți, Facturi, Contracte)", () => {
    render(
      <AppShell pageTitle="Test Page">
        <div>Content</div>
      </AppShell>
    );

    // Educational finance entries should be present (may appear in sidebar + mobile nav)
    expect(screen.getAllByText("Plăți").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Facturi").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Contracte").length).toBeGreaterThanOrEqual(1);
  });

  it("T-SPLIT-301-3 [normal] sidebar conține link discret spre Business Suite", () => {
    const { container } = render(
      <AppShell pageTitle="Test Page">
        <div>Content</div>
      </AppShell>
    );

    // Check for Business Suite link in sidebar (href=#/business or text "Business Suite")
    const allLinks = Array.from(container.querySelectorAll("a"));
    const businessLink = allLinks.find(
      (el) =>
        el.getAttribute("href")?.includes("/business") ||
        el.textContent?.includes("Business Suite")
    );
    expect(businessLink).toBeDefined();
  });
});
