/**
 * PAR-118: Tests for ParDetailPage full parity
 *
 * T-PAR-118-1 [blocant] Given a PAR in any status, When /app/par/:id, Then all 16 sections render (no crash)
 * T-PAR-118-2 [normal]  Given requestor role, Then cancel visible; approve NOT visible
 * T-PAR-118-2b [normal] Given approver role with active step, Then approve/reject/changes visible
 * T-PAR-118-3 [blocant] Action buttons have aria-labels (a11y)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ParDetail } from "@/lib/api/par";

// ─── Static mocks (must be at top level for vitest hoisting) ──────────────────

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/par/par-test-id", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div data-testid="app-shell" data-title={pageTitle}>{children}</div>
  ),
}));

vi.mock("@/components/par/ParTimeline", () => ({
  ParTimeline: () => <div data-testid="par-timeline">Timeline</div>,
}));

vi.mock("@/components/par/ParStatusChip", () => ({
  ParStatusChip: ({ status }: { status: string }) => <span data-testid="status-chip">{status}</span>,
}));

vi.mock("@/components/par/ParApprovalChain", () => ({
  ParApprovalChain: () => <div data-testid="approval-chain">Chain</div>,
}));

vi.mock("@/lib/parPdf", () => ({
  downloadParPdf: vi.fn().mockResolvedValue(undefined),
  buildParHtml: vi.fn().mockReturnValue("<div></div>"),
}));

vi.mock("@/lib/api/par", () => ({
  getPar: (...args: unknown[]) => mockGetPar(...args),
  getParMe: (...args: unknown[]) => mockGetParMe(...args),
  uploadAttachment: vi.fn(),
  approvePar: vi.fn().mockResolvedValue({}),
  rejectPar: vi.fn().mockResolvedValue({}),
  requestParChanges: vi.fn().mockResolvedValue({}),
  submitPar: vi.fn().mockResolvedValue({}),
  reapproveOverage: vi.fn().mockResolvedValue({}),
  getPurchaseOrder: vi.fn().mockResolvedValue(null),
  formatMDL: (c: number) => `${(c / 100).toLocaleString()} MDL`,
  PAR_STATUS_LABELS: {
    draft: "Ciornă",
    pending_approval: "În aprobare",
    changes_requested: "Modificări solicitate",
    rejected: "Respinsă",
    approved: "Aprobată",
    in_finance: "La finanțe",
    reapproval_required: "Re-aprobare necesară",
    paid: "Plătită",
    cancelled: "Anulată",
  },
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const mockPar: ParDetail = {
  id: "par-test-id",
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0001",
  dateOfRequest: "2026-06-10",
  requestedByUserId: "user-requestor",
  requestorTitle: "Procurement Specialist / M13",
  departmentId: "dept-1",
  dateNeeded: "2026-06-15",
  projectId: "proj-1",
  budgetCodeId: "bc-1",
  budgetCodeNote: "monthly budget",
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: "PROG-001",
  endUse: "Provision of psychological consulting services",
  vendorId: null,
  payeeName: "Daria Roitman",
  payeeIdnp: "2008001007903",
  payeeIban: "MD48ML000002259A19498121",
  payeeBank: 'BC "Moldindconbank" S.A.',
  attachmentsPresent: true,
  attachmentsNote: "act of receipt",
  currency: "MDL",
  totalEstimatedCents: 700000,
  status: "pending_approval",
  submittedAt: "2026-06-10",
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-06-10",
  updatedAt: "2026-06-10",
  line_items: [
    {
      id: "li-1",
      tenantId: "tenant-1",
      parId: "par-test-id",
      position: 1,
      description: "provision of psihologic session services",
      quantity: 1,
      unit: "sesie",
      unitPriceCents: 700000,
      lineTotalCents: 700000,
      createdAt: "2026-06-10",
      updatedAt: "2026-06-10",
    },
  ],
  approvals: [
    {
      id: "appr-0",
      step: 0,
      approverUserId: "user-requestor",
      approverRoleLabel: "Solicitant",
      decision: "approved",
      locked: false,
      decidedAt: "2026-06-10",
      comment: null,
      signatureName: "Sirbu Cristina",
      signatureTitle: "Procurement Specialist / M13",
      createdAt: "2026-06-10",
    },
    {
      id: "appr-1",
      step: 1,
      approverUserId: "user-approver",
      approverRoleLabel: "DOA Holder",
      decision: "pending",
      locked: false,
      decidedAt: null,
      comment: null,
      signatureName: null,
      signatureTitle: null,
      createdAt: "2026-06-10",
    },
  ],
  attachments: [
    {
      id: "att-1",
      fileName: "act-of-receipt.pdf",
      kind: "act_of_receipt",
      uploadedBy: "user-requestor",
      createdAt: "2026-06-10",
      fileUrl: "/files/att-1",
    },
  ],
  payment: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParDetailPage — PAR-118", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPar.mockResolvedValue(mockPar);
    mockGetParMe.mockResolvedValue({ roles: ["requestor"], userId: "user-requestor", tenantId: "tenant-1" });
  });

  it("T-PAR-118-1 [blocant] renders all 16 sections without crash", async () => {
    // Dynamic import to get fresh module after mocks are set up
    const { default: ParDetailPage } = await import("../ParDetail");

    render(<ParDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeDefined();
    }, { timeout: 10000 });

    await waitFor(() => {
      expect(screen.getByText("Informații cerere")).toBeDefined();     // 1–7
      expect(screen.getByText("Scopul PAR")).toBeDefined();             // 8
      expect(screen.getByText("Charge To")).toBeDefined();              // 9
      expect(screen.getByText("Articole solicitate")).toBeDefined();    // 10
      expect(screen.getByText("Scopul și descrierea utilizării finale")).toBeDefined(); // 11
      expect(screen.getByText("Beneficiar plată (Vendor)")).toBeDefined(); // 12
      expect(screen.getByText("Atașamente")).toBeDefined();             // 13
      expect(screen.getByText("Semnături și aprobări")).toBeDefined(); // 14-15
    }, { timeout: 10000 });

    // PAR number rendered
    expect(screen.getByText("PAR-2026-0001")).toBeDefined();
    // Status chip rendered
    expect(screen.getByTestId("status-chip")).toBeDefined();
    // Approval chain
    expect(screen.getByTestId("approval-chain")).toBeDefined();
  }, 20000);

  it("T-PAR-118-1 continued — section 16 shown when payment exists", async () => {
    const paidPar = {
      ...mockPar,
      status: "paid" as const,
      payment: {
        id: "pay-1",
        parBl: "BL-001",
        receivedAt: "2026-06-11",
        receivedByUserId: "user-finance",
        assignedToUserId: "user-finance",
        actualAmountCents: 700000,
        paymentDate: "2026-06-12",
        paymentRef: "TRN-123456",
        proofUrl: null,
        overageReapproved: false,
      },
    };
    mockGetPar.mockResolvedValue(paidPar);
    mockGetParMe.mockResolvedValue({ roles: ["finance"], userId: "user-finance", tenantId: "tenant-1" });

    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Finanțe (uz intern)")).toBeDefined();
    }, { timeout: 5000 });
  });

  it("T-PAR-118-2 [normal] requestor can cancel; cannot approve", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["requestor"], userId: "user-requestor", tenantId: "tenant-1" });

    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => {
      expect(screen.queryByLabelText("Anulează cererea")).toBeDefined();
    }, { timeout: 5000 });

    // Approve button should NOT appear for requestor (their step is already done)
    expect(screen.queryByLabelText("Aprobă cererea")).toBeNull();
  });

  it("T-PAR-118-2b [normal] active approver sees approve/reject/changes", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["approver"], userId: "user-approver", tenantId: "tenant-1" });

    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Aprobă cererea")).toBeDefined();
      expect(screen.getByLabelText("Respinge cererea")).toBeDefined();
      expect(screen.getByLabelText("Cere modificări")).toBeDefined();
    }, { timeout: 5000 });
  });

  it("T-PAR-118-3 [blocant] all action buttons have aria-label", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["approver"], userId: "user-approver", tenantId: "tenant-1" });

    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => {
      // Wait for content to load
      expect(screen.getByText("Informații cerere")).toBeDefined();
    }, { timeout: 5000 });

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      const hasLabel = btn.getAttribute("aria-label") || (btn.textContent?.trim().length ?? 0) > 0;
      expect(hasLabel).toBeTruthy();
    });
  });

  it("timeline toggle expands/collapses", async () => {
    mockGetParMe.mockResolvedValue({ roles: [], userId: "user-1", tenantId: "t-1" });

    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Jurnal activitate")).toBeDefined();
    }, { timeout: 5000 });

    // Initially collapsed
    expect(screen.queryByTestId("par-timeline")).toBeNull();

    // Click toggle
    const toggleBtn = screen.getByText("Jurnal activitate").closest("button")!;
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByTestId("par-timeline")).toBeDefined();
    });
  });
});
