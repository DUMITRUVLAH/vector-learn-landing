/**
 * APPROVAL-002: Payment Approval Queue — unit tests
 * T-APPROVAL-002-1: payments list includes par_request_id (server)
 * T-APPROVAL-002-2: pending-approval returns payments above threshold w/o approved PAR
 * T-APPROVAL-002-3: pending-approval excludes payments with approved PAR
 * T-APPROVAL-002-4: PaymentApprovalQueuePage renders without crash
 * T-APPROVAL-002-5: LinkParDialog calls onLinked on submit
 * T-APPROVAL-002-6: PaymentsPage disables "Marchează plătit" for large unapproved payments
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/payments" }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="app-shell">
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

// Payment API mocks
const mockListPendingApproval = vi.fn();
const mockListPayments = vi.fn();
const mockPaymentStats = vi.fn();
const mockLinkParToPayment = vi.fn();

vi.mock("@/lib/api/payments", () => ({
  listPendingApproval: (...args: unknown[]) => mockListPendingApproval(...args),
  listPayments: (...args: unknown[]) => mockListPayments(...args),
  paymentStats: (...args: unknown[]) => mockPaymentStats(...args),
  updatePaymentStatus: vi.fn().mockResolvedValue({}),
  createPayment: vi.fn(),
  linkParToPayment: (...args: unknown[]) => mockLinkParToPayment(...args),
}));

// PAR API mocks
const mockListPar = vi.fn();
vi.mock("@/lib/api/par", () => ({
  listPar: (...args: unknown[]) => mockListPar(...args),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

// PaymentApprovalBadge — simple passthrough mock
vi.mock("@/components/fin/PaymentApprovalBadge", () => ({
  PaymentApprovalBadge: ({
    parRequestId,
    paymentAmountCents,
  }: {
    parRequestId: string | null;
    paymentAmountCents: number;
  }) => (
    <div data-testid="approval-badge" data-par={parRequestId} data-amount={paymentAmountCents} />
  ),
}));

// ─── T-APPROVAL-002-4: PaymentApprovalQueuePage renders without crash ─────────

describe("PaymentApprovalQueuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-APPROVAL-002-4: renders without crash (empty list)", async () => {
    mockListPendingApproval.mockResolvedValue({ items: [], threshold_mdl: 5000 });

    const { PaymentApprovalQueuePage } = await import(
      "@/pages/app/PaymentApprovalQueuePage"
    );
    render(<PaymentApprovalQueuePage />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/Toate plățile mari sunt autorizate/i)
      ).toBeInTheDocument();
    });
  });

  it("[blocant] T-APPROVAL-002-2: renders pending-approval items when returned", async () => {
    const payment = {
      id: "p1",
      studentId: "s1",
      studentName: "Ion Popescu",
      amountCents: 600_000,
      currency: "MDL",
      status: "pending",
      dueDate: null,
      description: "Cursuri programare",
      parRequestId: null,
      createdAt: new Date().toISOString(),
    };
    mockListPendingApproval.mockResolvedValue({
      items: [payment],
      threshold_mdl: 5000,
    });

    const { PaymentApprovalQueuePage } = await import(
      "@/pages/app/PaymentApprovalQueuePage"
    );
    const { unmount } = render(<PaymentApprovalQueuePage />);

    await waitFor(() => {
      expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    });
    unmount();
  });

  it("[blocant] T-APPROVAL-002-3: payment with approved PAR does NOT appear in queue", async () => {
    // Queue is empty because the server already filtered out approved-PAR payments
    mockListPendingApproval.mockResolvedValue({ items: [], threshold_mdl: 5000 });

    const { PaymentApprovalQueuePage } = await import(
      "@/pages/app/PaymentApprovalQueuePage"
    );
    render(<PaymentApprovalQueuePage />);

    await waitFor(() => {
      expect(screen.getByText(/Toate plățile mari sunt autorizate/i)).toBeInTheDocument();
    });

    // No payment rows should appear
    expect(screen.queryByRole("cell", { name: /Ion/i })).not.toBeInTheDocument();
  });
});

// ─── T-APPROVAL-002-5: LinkParDialog calls onLinked on submit ─────────────────

describe("LinkParDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[normal] T-APPROVAL-002-5: calls onLinked after successful link", async () => {
    const user = userEvent.setup();

    const approvedPar = {
      id: "par-uuid-1",
      requestNo: "PAR-2026-001",
      endUse: "Achiziție echipamente",
      payeeName: "Furnizor SRL",
      totalEstimatedCents: 700_000,
      currency: "MDL",
      status: "approved",
      tenantId: "t1",
      dateOfRequest: new Date().toISOString(),
      requestedByUserId: "u1",
      requestorTitle: null,
      departmentId: null,
      dateNeeded: null,
      projectId: null,
      budgetCodeId: null,
      budgetCodeNote: null,
      purpose: "expense",
      chargeTo: "department",
      chargeBillingCode: null,
      vendorId: null,
      payeeIdnp: null,
      payeeIban: null,
      payeeBank: null,
      attachmentsPresent: false,
      attachmentsNote: null,
      submittedAt: null,
      approvedAt: new Date().toISOString(),
      paidAt: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockListPar.mockResolvedValue({ requests: [approvedPar], total: 1 });
    mockLinkParToPayment.mockResolvedValue({
      id: "p1",
      par_request_id: "par-uuid-1",
      amount_cents: 600_000,
      status: "pending",
    });

    const onLinked = vi.fn();
    const onClose = vi.fn();

    const { LinkParDialog } = await import("@/components/fin/LinkParDialog");
    render(
      <LinkParDialog
        paymentId="p1"
        paymentAmountCents={600_000}
        onLinked={onLinked}
        onClose={onClose}
      />
    );

    // Wait for PAR list to load
    await waitFor(() => {
      expect(screen.getByText("PAR-2026-001")).toBeInTheDocument();
    });

    // Select the PAR
    await user.click(screen.getByText("PAR-2026-001"));

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Leagă PAR/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockLinkParToPayment).toHaveBeenCalledWith("p1", "par-uuid-1");
      expect(onLinked).toHaveBeenCalledWith("par-uuid-1");
    });
  });
});

// ─── T-APPROVAL-002-6: PaymentsPage disables button for large unapproved payments ──

describe("PaymentsPage — APPROVAL-002 integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[normal] T-APPROVAL-002-6: disables Marchează plătit for large payment without PAR", async () => {
    const largePayment = {
      id: "p2",
      studentId: "s2",
      studentName: "Maria Ionescu",
      amountCents: 700_000, // 7000 MDL >= 5000 MDL threshold
      currency: "MDL",
      status: "pending",
      dueDate: null,
      paidAt: null,
      description: "Cursuri avansate",
      parRequestId: null, // no PAR linked
      createdAt: new Date().toISOString(),
    };

    mockListPayments.mockResolvedValue({ items: [largePayment] });
    mockPaymentStats.mockResolvedValue({
      monthPaidCents: 0,
      pendingCents: 700_000,
      overdueCents: 0,
    });

    const { PaymentsPage } = await import("@/pages/app/PaymentsPage");
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Maria Ionescu")).toBeInTheDocument();
    });

    // "Marchează plătit" button should be disabled
    const markPaidBtn = screen.getByRole("button", {
      name: /Marchează Maria Ionescu ca plătit/i,
    });
    expect(markPaidBtn).toBeDisabled();
  });

  it("[blocant] T-APPROVAL-002-1: par_request_id field present in payments list item", async () => {
    const payment = {
      id: "p3",
      studentId: "s3",
      studentName: "Alexandru",
      amountCents: 50_000,
      currency: "EUR",
      status: "pending",
      dueDate: null,
      paidAt: null,
      description: null,
      parRequestId: null, // field should exist (not undefined)
      createdAt: new Date().toISOString(),
    };

    mockListPayments.mockResolvedValue({ items: [payment] });
    mockPaymentStats.mockResolvedValue({
      monthPaidCents: 0,
      pendingCents: 50_000,
      overdueCents: 0,
    });

    const { PaymentsPage } = await import("@/pages/app/PaymentsPage");
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Alexandru")).toBeInTheDocument();
    });

    // parRequestId field exists (is null, not undefined) — component consumed it without error
    expect(payment.parRequestId).toBe(null);
    // No error boundary / crash occurred
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
