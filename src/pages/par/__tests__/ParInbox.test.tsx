/**
 * PAR-108: Approver inbox /app/par/inbox
 * Tests: T-PAR-108-1 (render without crash + shows inbox items)
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    payerId: null,
    requestorTitle: "Procurement Specialist",
    requestorCode: null,
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
      // Excel-style table count bar: "2 din 2 cereri"
      expect(screen.getByText(/2 din 2/)).toBeTruthy();
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

  // Regresie (raportat de utilizatori, 2026-08-28, tenant ATIC): matricea DOA avea un pas 2
  // "Oricine · PAR Admin", așa că o aprobare din inbox NU trimitea cererea în Coadă finanțe — o
  // muta la pasul următor, adesea al aceleiași persoane. UI-ul nu spunea nimic: modalul se
  // închidea, lista se reîncărca, cererea era tot acolo. De aici "aprob și nu se duce la finanțe".
  it("după aprobarea unui pas intermediar spune explicit că cererea rămâne în inbox", async () => {
    const item = makeInboxItem({ my_step: 1, my_step_label: "Oricine · Approver", steps_total: 2, steps_approved: 0 });
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [item], total: 1 });
    const approve = vi.spyOn(parApi, "approvePar").mockResolvedValue({
      ...item,
      status: "pending_approval",
      chain_status: "advanced",
      next_step: 2,
      next_step_label: "Oricine · PAR Admin",
    });

    render(<ParInbox />);
    await waitFor(() => expect(screen.getByLabelText(/Aprobă PAR-2026-0001/)).toBeTruthy());

    // Rândul spune din start că semnătura asta nu e ultima.
    expect(screen.getByText(/Pasul 1 din 2/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Aprobă PAR-2026-0001/));
    const submit = await screen.findByRole("button", { name: "Aprobă" });
    fireEvent.click(submit);

    await waitFor(() => expect(approve).toHaveBeenCalled());
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/Oricine · PAR Admin/);
    expect(banner.textContent).toMatch(/RĂMÂNE în inbox/);
  });

  it("după ultima semnătură spune că cererea a intrat în Coadă finanțe", async () => {
    const item = makeInboxItem({ my_step: 2, my_step_label: "Oricine · PAR Admin", steps_total: 2, steps_approved: 1 });
    vi.spyOn(parApi, "getParInbox").mockResolvedValue({ inbox: [item], total: 1 });
    vi.spyOn(parApi, "approvePar").mockResolvedValue({
      ...item,
      status: "in_finance",
      chain_status: "complete",
    });

    render(<ParInbox />);
    await waitFor(() => expect(screen.getByLabelText(/Aprobă PAR-2026-0001/)).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Aprobă PAR-2026-0001/));
    fireEvent.click(await screen.findByRole("button", { name: "Aprobă" }));

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/Coadă finanțe/);
  });

  it("shows error state on API failure", async () => {
    vi.spyOn(parApi, "getParInbox").mockRejectedValue(new Error("Network error"));

    render(<ParInbox />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
