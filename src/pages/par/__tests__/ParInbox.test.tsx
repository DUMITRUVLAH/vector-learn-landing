/**
 * PAR-108: Approver inbox /app/par/inbox
 * Tests: T-PAR-108-1 (render without crash + shows inbox items)
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ParInbox from "../ParInbox";
import * as parApi from "@/lib/api/par";
import type { ParInboxItem } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/par/inbox",
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

function makeInboxItem(overrides: Partial<ParInboxItem> = {}): ParInboxItem {
  return {
    id: "par-inbox-001",
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
    endUse: "Test end use",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "Moldindconbank",
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    above_micro_threshold: false,
    status: "pending_approval",
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    my_step: 1,
    my_step_label: "DOA Holder",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-PAR-108-1 [blocant] renders without crash on empty inbox", async () => {
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [], total: 0 });
    render(<ParInbox />);
    expect(screen.getByTestId("app-shell")).toBeTruthy();
  });

  it("T-PAR-108-1 shows inbox items when present", async () => {
    const item = makeInboxItem();
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [item], total: 1 });

    render(<ParInbox />);

    await waitFor(() => {
      expect(screen.getByText("PAR-2026-0001")).toBeTruthy();
    });
  });

  it("shows empty state when inbox is empty", async () => {
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [], total: 0 });

    render(<ParInbox />);

    await waitFor(() => {
      expect(screen.getByText("Nicio cerere în așteptare.")).toBeTruthy();
    });
  });

  it("shows PAR count in inbox", async () => {
    const items = [makeInboxItem(), makeInboxItem({ id: "par-002", requestNo: "PAR-2026-0002" })];
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: items, total: 2 });

    render(<ParInbox />);

    await waitFor(() => {
      // 2 cereri in aşteptare
      expect(screen.getByText(/2 cereri în așteptare/)).toBeTruthy();
    });
  });

  it("shows approve, request-changes and reject buttons for each item", async () => {
    const item = makeInboxItem();
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [item], total: 1 });

    render(<ParInbox />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Aprobă PAR-2026-0001/)).toBeTruthy();
      expect(screen.getByLabelText(/Solicită modificări la PAR-2026-0001/)).toBeTruthy();
      expect(screen.getByLabelText(/Respinge PAR-2026-0001/)).toBeTruthy();
    });
  });

  it("shows error state on API failure", async () => {
    vi.spyOn(parApi, "getParInbox").mockRejectedValue(new Error("Network error"));

    render(<ParInbox />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
