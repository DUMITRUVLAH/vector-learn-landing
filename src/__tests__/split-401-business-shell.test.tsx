/**
 * SPLIT-401 — Business Suite shell unification tests.
 * Verifies that pages under /business/* show Business Suite chrome, not CRM chrome.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { name: "Andreea Mitran", role: "admin" }, tenant: { name: "Demo Lingua School", institutionType: "scoala" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { name: "Business Admin", role: "owner" }, tenant: { name: "FinDesk SRL", slug: "findesk", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/fin/parties", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={`#${to}`} {...rest}>{children}</a>,
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <span data-testid="crm-logo">Vector Learn</span>,
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <span data-testid="notification-bell" />,
}));

vi.mock("@/components/app/BranchSwitcher", () => ({
  BranchSwitcher: () => <span data-testid="branch-switcher" />,
}));

vi.mock("@/lib/institution", () => ({
  isModuleVisible: () => true,
}));

// Lazy import after mocks
const { AppShell } = await import("@/components/app/AppShell");

// ── Tests ──────────────────────────────────────────────────────────────────

describe("SPLIT-401 — AppShell on /business/* routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SPLIT-401-1 [blocant] shows Business Suite branding, not CRM tenant name", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );

    // Should show Business Suite, not Vector Learn logo
    expect(screen.queryByTestId("crm-logo")).toBeNull();
    // Should show business identity (at least once in the header)
    expect(screen.getAllByText(/Business Suite/i).length).toBeGreaterThan(0);
    // Should NOT show CRM tenant
    expect(screen.queryByText("Demo Lingua School")).toBeNull();
  });

  it("T-SPLIT-401-1b shows business user name in header", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByText("Business Admin")).toBeInTheDocument();
  });

  it("T-SPLIT-401-2 shows business logout button with correct aria-label", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    expect(screen.getByLabelText(/Deconectare Business Suite/i)).toBeInTheDocument();
  });

  it("T-SPLIT-401-2b CRM logo is NOT rendered when on /business/* route", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );
    // CRM tenant name should not appear
    expect(screen.queryByText("Demo Lingua School")).toBeNull();
    // CRM logout should not appear
    expect(screen.queryByLabelText(/^Logout$/)).toBeNull();
  });
});
