/**
 * PERF audit fix #3 — /business/par search box.
 *
 * Before this fix: every keystroke fired its own `GET /api/par?q=…` AND changed the
 * `listKey` used for the keep-alive list state, so the list disappeared behind a
 * "Se încarcă…" spinner on every letter. Worse, nothing guaranteed request ORDER: a
 * slow response for an old query could resolve after a faster response for the
 * current query and silently overwrite it.
 *
 * These tests would have FAILED against the pre-fix code:
 *   - "ana" typed as a → an → ana fired THREE requests (one per keystroke) with no debounce.
 *   - a delayed response for an abandoned query always overwrote the current one (no guard).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParDashboard } from "../ParDashboard";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: React.ReactNode; actions?: React.ReactNode }) => (
    <div data-testid="app-shell">
      {pageTitle ? <h1>{pageTitle}</h1> : null}
      {actions}
      {children}
    </div>
  ),
}));

const makeRequest = (
  overrides: Partial<ParRequest & { above_micro_threshold: boolean }> = {},
): ParRequest & { above_micro_threshold: boolean } => ({
  id: `par-${Math.random().toString(36).slice(2)}`,
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0001",
  dateOfRequest: new Date().toISOString(),
  requestedByUserId: "user-1",
  payerId: null,
  requestorTitle: null,
  requestorCode: null,
  departmentId: null,
  dateNeeded: null,
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment" as const,
  chargeTo: "program" as const,
  chargeBillingCode: null,
  endUse: null,
  vendorId: null,
  payeeName: null,
  payeeIdnp: null,
  payeeIban: null,
  payeeBank: null,
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 700000,
  above_micro_threshold: false,
  status: "draft" as const,
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ParDashboard search — debounce + staleness guard", () => {
  it("typing 'a' → 'an' → 'ana' quickly produces a single request, for the settled value", async () => {
    const spy = vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 });
    render(<ParDashboard />);

    // Initial mount load.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    spy.mockClear();

    const search = screen.getByRole("searchbox", { name: /Caută cereri PAR/ });
    fireEvent.change(search, { target: { value: "a" } });
    fireEvent.change(search, { target: { value: "an" } });
    fireEvent.change(search, { target: { value: "ana" } });

    // Nothing fires immediately — the request waits for the debounce window.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(spy).not.toHaveBeenCalled();

    // Exactly ONE request fires once typing settles, carrying the FINAL value.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ q: "ana" });
  });

  it("a delayed response for an abandoned search never overwrites a faster response for the current one", async () => {
    let resolveOld!: (v: { requests: (ParRequest & { above_micro_threshold: boolean })[]; total: number }) => void;
    let resolveNew!: (v: { requests: (ParRequest & { above_micro_threshold: boolean })[]; total: number }) => void;

    const spy = vi.spyOn(parApi, "listPar").mockImplementation(async (filters) => {
      if (filters?.q === "old") return new Promise((res) => { resolveOld = res; });
      if (filters?.q === "new") return new Promise((res) => { resolveNew = res; });
      return { requests: [], total: 0 };
    });

    render(<ParDashboard />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const search = screen.getByRole("searchbox", { name: /Caută cereri PAR/ });

    // First search: "old" — its request starts but we never resolve it yet.
    fireEvent.change(search, { target: { value: "old" } });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2), { timeout: 1000 });

    // User keeps typing/changes their mind before "old" ever answers: "new".
    fireEvent.change(search, { target: { value: "new" } });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3), { timeout: 1000 });

    // "new" (the CURRENT query) answers first — should render immediately.
    resolveNew({ requests: [makeRequest({ requestNo: "PAR-NEW" })], total: 1 });
    await screen.findByText("PAR-NEW");

    // "old" (an abandoned, earlier query) answers LATE — must be discarded, not applied.
    resolveOld({ requests: [makeRequest({ requestNo: "PAR-OLD" })], total: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.getByText("PAR-NEW")).toBeInTheDocument();
    expect(screen.queryByText("PAR-OLD")).not.toBeInTheDocument();
  });
});
