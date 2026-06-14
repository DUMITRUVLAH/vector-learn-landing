/**
 * CORE-005 tests — FinDesk onboarding 3-step wizard
 * T-CORE-005-1 [blocant] PATCH /onboarding advances step + persists
 * T-CORE-005-2 [blocant] At step=done, GET returns done; UI redirects to FinHome
 * T-CORE-005-3 [blocant] FinOnboarding renders without crash (smoke)
 * T-CORE-005-4 [blocant] check-route-mounts + check-undefined-refs (validated by build)
 * T-CORE-005-5 [normal]  Skip goes to done → navigate /app/fin
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinOnboarding } from "../FinOnboarding";

// ── Mock FinLayout to isolate the wizard ────────────────────────────────────────
vi.mock("../FinLayout", () => ({
  FinLayout: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle?: string;
    pageDescription?: string;
  }) => (
    <div>
      {pageTitle && <h1>{pageTitle}</h1>}
      <main>{children}</main>
    </div>
  ),
}));

// ── Mock router ────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/onboarding", navigate: mockNavigate }),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

// ── Mock fetch ─────────────────────────────────────────────────────────────────

function makeOnboarding(
  step: "company" | "parties" | "first_invoice" | "done",
  completedSteps: string[] = []
) {
  return {
    id: "test-id",
    tenantId: "tenant-1",
    step,
    completedSteps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mockFetchGet(step: "company" | "parties" | "first_invoice" | "done", completedSteps: string[] = []) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ onboarding: makeOnboarding(step, completedSteps) }),
  } as unknown as Response);
}

function mockFetchPatch(step: "company" | "parties" | "first_invoice" | "done", completedSteps: string[] = []) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({ onboarding: makeOnboarding(step, completedSteps) }),
  } as unknown as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FinOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-CORE-005-3 renders without crash — shows step 1 for new tenant", async () => {
    globalThis.fetch = mockFetchGet("company");
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(screen.getByText("Tur de instalare")).toBeInTheDocument();
    });
    expect(screen.getByText("Configurează compania")).toBeInTheDocument();
  });

  it("T-CORE-005-3b shows progress indicator", async () => {
    globalThis.fetch = mockFetchGet("company");
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(screen.getByText("Progres")).toBeInTheDocument();
    });
    // Shows 0/3 initially (step index 0)
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("T-CORE-005-3c renders all 3 step labels", async () => {
    globalThis.fetch = mockFetchGet("company");
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(screen.getByText("Configurează compania")).toBeInTheDocument();
    });
    expect(screen.getByText("Adaugă primul partener")).toBeInTheDocument();
    expect(screen.getByText("Emite prima factură")).toBeInTheDocument();
  });

  it("T-CORE-005-1 clicking 'Pas următor' sends PATCH and advances step", async () => {
    const user = userEvent.setup();
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // GET /api/fin/onboarding
        return Promise.resolve({
          ok: true,
          json: async () => ({ onboarding: makeOnboarding("company") }),
        } as unknown as Response);
      }
      // PATCH /api/fin/onboarding
      return Promise.resolve({
        ok: true,
        json: async () => ({ onboarding: makeOnboarding("parties", ["company"]) }),
      } as unknown as Response);
    });

    render(<FinOnboarding />);
    await waitFor(() => expect(screen.getByText("Configurează compania")).toBeInTheDocument());

    const nextBtn = screen.getByRole("button", { name: /marchează pasul ca finalizat/i });
    await act(async () => {
      await user.click(nextBtn);
    });

    await waitFor(() => {
      // PATCH was called
      expect(callCount).toBe(2);
    });
  });

  it("T-CORE-005-2 when step=done on load, immediately redirects to /app/fin", async () => {
    globalThis.fetch = mockFetchGet("done");
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/fin");
    });
  });

  it("T-CORE-005-5 skip button sends PATCH done and navigates to /app/fin", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ onboarding: makeOnboarding("company") }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ onboarding: makeOnboarding("done", ["company"]) }),
      } as unknown as Response);
    });

    const user = userEvent.setup();
    render(<FinOnboarding />);
    await waitFor(() => expect(screen.getByText("Configurează compania")).toBeInTheDocument());

    const skipBtn = screen.getByRole("button", { name: /sari peste tur/i });
    await act(async () => {
      await user.click(skipBtn);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/fin");
    });
  });

  it("T-CORE-005-3d step 1 'Deschide profilul firmei' links to /app/fin/company", async () => {
    globalThis.fetch = mockFetchGet("company");
    render(<FinOnboarding />);
    await waitFor(() => expect(screen.getByText("Deschide profilul firmei")).toBeInTheDocument());
    const link = screen.getByRole("link", { name: /deschide profilul firmei/i });
    expect(link).toHaveAttribute("href", "#/app/fin/company");
  });

  it("T-CORE-005-3e step 2 and 3 show 'În curând' badge when modules not available", async () => {
    globalThis.fetch = mockFetchGet("parties");
    render(<FinOnboarding />);
    await waitFor(() => expect(screen.getByText("Adaugă primul partener")).toBeInTheDocument());
    const badges = screen.getAllByText("În curând");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("T-CORE-005-3f shows progress at 1/3 when on step parties", async () => {
    globalThis.fetch = mockFetchGet("parties", ["company"]);
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(screen.getByText("1/3")).toBeInTheDocument();
    });
  });

  it("T-CORE-005-3g progressbar has correct aria attributes", async () => {
    globalThis.fetch = mockFetchGet("company");
    render(<FinOnboarding />);
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
  });

  it("T-CORE-005-3h shows error if fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    render(<FinOnboarding />);
    await waitFor(() => {
      expect(screen.getByText(/nu am putut încărca/i)).toBeInTheDocument();
    });
  });
});
