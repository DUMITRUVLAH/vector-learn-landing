/**
 * VM1-01: Tests for PAR section visibility gating in BusinessShell.
 *
 * T-VM1-01-1 [blocant]: roles=[] → PAR section NOT in DOM
 * T-VM1-01-2 [blocant]: roles=["approver"] → PAR section visible, FinDesk/ITPark also visible
 * T-VM1-01-3 [normal]: loading state → no flicker (PAR hidden during load)
 * T-VM1-01-4 [normal]: 401 from /api/par/me → behaves as roles=[]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useParRoles } from "@/hooks/useParRoles";
import { BusinessShell } from "@/components/business/BusinessShell";

// Mock the hooks/modules that require full app context
vi.mock("@/hooks/useParRoles");
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", email: "a@b.com", name: "Test User", role: "admin" }, tenant: { id: "t1", name: "Org", slug: "org", appKind: "business" } },
    error: null,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
  useRouter: () => ({ path: "/business/dashboard", navigate: vi.fn() }),
}));
vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

const mockUseParRoles = vi.mocked(useParRoles);

function renderShell() {
  return render(
    <BusinessShell pageTitle="Test">
      <div data-testid="content">Content</div>
    </BusinessShell>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("T-VM1-01-1 [blocant] PAR section hidden when roles=[]", () => {
  it("should NOT render PAR section when user has no PAR roles", async () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: [] });
    renderShell();

    await waitFor(() => {
      // The PAR sidebar section heading should not appear
      expect(screen.queryByText("PAR — Cereri de plată")).not.toBeInTheDocument();
      // The PAR nav items should not appear
      expect(screen.queryByText("Cereri")).not.toBeInTheDocument();
      expect(screen.queryByText("Inbox aprobare")).not.toBeInTheDocument();
      expect(screen.queryByText("Rapoarte PAR")).not.toBeInTheDocument();
    });
  });

  it("PAR links are completely absent from DOM when roles=[]", () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: [] });
    renderShell();

    // No link to /business/par should be in sidebar when roles=[]
    const parLinks = document.querySelectorAll('a[href*="business/par"]');
    // The PAR section links (sidebar) should not exist
    expect(parLinks.length).toBe(0);
  });
});

describe("T-VM1-01-2 [blocant] PAR and other sections visible when roles present", () => {
  it("should render PAR section when user has approver role", async () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["approver"] });
    renderShell();

    await waitFor(() => {
      // PAR section visible
      expect(screen.getByText("PAR — Cereri de plată")).toBeInTheDocument();
    });
  });

  it("FinDesk section always visible regardless of PAR roles", async () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["approver"] });
    renderShell();

    await waitFor(() => {
      expect(screen.getByText("FinDesk — Finanțe")).toBeInTheDocument();
    });
  });

  it("FinDesk visible even when user has no PAR roles", async () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: [] });
    renderShell();

    await waitFor(() => {
      expect(screen.getByText("FinDesk — Finanțe")).toBeInTheDocument();
    });
  });

  // ITPark is reached through the always-present, collapsible "FinDesk — Finanțe"
  // section (nav item "Rezidenți ITPark") — there is no standalone ITPark section in
  // the business shell (a dedicated ITPark section only appears on /business/fin/itpark
  // routes). This asserts ITPark stays reachable regardless of PAR roles.
  it("ITPark reachable via the always-present FinDesk section regardless of PAR roles", async () => {
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: [] });
    renderShell();

    const finDeskToggle = await screen.findByText("FinDesk — Finanțe");
    fireEvent.click(finDeskToggle); // expand the collapsible section
    await waitFor(() => {
      expect(screen.getByText("Rezidenți ITPark")).toBeInTheDocument();
    });
  });
});

describe("T-VM1-01-3 [normal] Loading state — no flicker", () => {
  it("should NOT render PAR section while roles are loading", () => {
    mockUseParRoles.mockReturnValue({ status: "loading", roles: [] });
    renderShell();

    // During loading, PAR section must be hidden (fail-closed = no flicker)
    expect(screen.queryByText("PAR — Cereri de plată")).not.toBeInTheDocument();
    expect(screen.queryByText("Cereri")).not.toBeInTheDocument();
  });
});

describe("T-VM1-01-4 [normal] 401 response treated as roles=[]", () => {
  it("should behave as roles=[] when getParMe returns empty roles due to 401", async () => {
    // useParRoles catches 401 and returns { status: "resolved", roles: [] }
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: [] });
    renderShell();

    await waitFor(() => {
      expect(screen.queryByText("PAR — Cereri de plată")).not.toBeInTheDocument();
    });

    // Shell should still render (no crash)
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
