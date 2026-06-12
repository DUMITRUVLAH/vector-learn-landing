/**
 * PAR-112: Finance queue /app/par/finance
 * Tests:
 *   T-PAR-112-1 [blocant] render without crash + shows queue items
 *   T-PAR-112-4 [normal] obtain_quotations PARs don't appear (filtered server-side, but component handles empty gracefully)
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ParFinanceQueue from "../ParFinanceQueue";
import * as parApi from "@/lib/api/par";
import type { ParFinanceQueueItem } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/par/finance",
    navigate: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/components/par/ParStatusChip", () => ({
  ParStatusChip: ({ status }: { status: string }) => (
    <span data-testid="status-chip">{status}</span>
  ),
}));

function makeFinanceItem(overrides: Partial<ParFinanceQueueItem> = {}): ParFinanceQueueItem {
  return {
    id: "par-fin-001",
    tenantId: "tenant-1",
    requestNo: "PAR-2026-0001",
    dateOfRequest: new Date().toISOString(),
    requestedByUserId: "user-requestor",
    requestorTitle: "Procurement Specialist",
    departmentId: null,
    dateNeeded: null,
    projectId: null,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Group consulting",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "Moldindconbank",
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    status: "approved",
    submittedAt: null,
    approvedAt: new Date().toISOString(),
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    above_micro_threshold: true,
    payment: null,
    ...overrides,
  } as ParFinanceQueueItem;
}

// ─── T-PAR-112-1 [blocant]: render without crash ──────────────────────────────

describe("ParFinanceQueue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("T-PAR-112-1 [blocant] renders without crash when queue is empty", async () => {
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items: [], total: 0 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    // Empty state message
    await waitFor(() => {
      expect(screen.getByText(/nicio cerere/i)).toBeInTheDocument();
    });
  });

  it("T-PAR-112-1 [blocant] renders PAR items in queue table without crash", async () => {
    const items = [
      makeFinanceItem({ requestNo: "PAR-2026-0001", status: "approved" }),
      makeFinanceItem({ id: "par-fin-002", requestNo: "PAR-2026-0002", status: "in_finance" }),
    ];
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items, total: 2 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.getByText("PAR-2026-0001")).toBeInTheDocument();
    });

    expect(screen.getByText("PAR-2026-0002")).toBeInTheDocument();
    expect(screen.getAllByTestId("status-chip")).toHaveLength(2);
  });

  it("T-PAR-112-1 [blocant] shows section 16 button for approved items", async () => {
    const items = [makeFinanceItem({ status: "approved" })];
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items, total: 1 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /completează secțiunea 16/i })).toBeInTheDocument();
    });
  });

  it("shows 'Înregistrează plata' button for in_finance items", async () => {
    const items = [makeFinanceItem({ status: "in_finance" })];
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items, total: 1 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /înregistrează plata/i })).toBeInTheDocument();
    });
  });

  it("shows reapproval warning for reapproval_required without overage_reapproved", async () => {
    const items = [
      makeFinanceItem({
        status: "reapproval_required",
        payment: {
          id: "pmt-001",
          tenantId: "tenant-1",
          parId: "par-fin-001",
          parBl: null,
          receivedAt: null,
          receivedByUserId: null,
          assignedToUserId: null,
          actualAmountCents: 800000,
          paymentDate: null,
          paymentRef: null,
          proofUrl: null,
          overageReapproved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    ];
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items, total: 1 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.getByText(/re-aprobare necesară/i)).toBeInTheDocument();
      expect(screen.getByText(/așteptare re-aprobare/i)).toBeInTheDocument();
    });
  });

  it("T-PAR-112-4 [normal] empty queue renders gracefully (obtain_quotations filtered server-side)", async () => {
    // The server filters out obtain_quotations; component receives empty array
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items: [], total: 0 });

    render(<ParFinanceQueue />);

    await waitFor(() => {
      // Should show empty state, not crash
      expect(screen.getByText(/nicio cerere/i)).toBeInTheDocument();
    });
  });

  it("shows error state on API failure without crash", async () => {
    vi.spyOn(parApi, "getFinanceQueue").mockRejectedValue(new Error("Network error"));

    render(<ParFinanceQueue />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("reload button re-fetches data", async () => {
    const spy = vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items: [], total: 0 });

    render(<ParFinanceQueue />);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const reloadBtn = screen.getByRole("button", { name: /reîncarcă/i });
    reloadBtn.click();

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
