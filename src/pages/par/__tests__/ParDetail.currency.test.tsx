/**
 * Regresie: o cerere în valută străină nu se mai scrie cu „L" pe linii.
 *
 * Totalul estimat trecea deja prin formatarea pe monedă, dar prețul unitar, totalul liniei și
 * suma reală plătită mergeau prin `formatMDL` — așa că un PAR de 1.500 USD se afișa „1.500,00 L"
 * pe fiecare linie și „1.500,00 USD" pe total, în același tabel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { ParDetail } from "@/lib/api/par";

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/par-usd", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/par/ParTimeline", () => ({ ParTimeline: () => <div /> }));
vi.mock("@/components/par/ParStatusChip", () => ({ ParStatusChip: () => <span /> }));
vi.mock("@/components/par/ParApprovalChain", () => ({ ParApprovalChain: () => <div /> }));

vi.mock("@/lib/parPdf", () => ({
  downloadParPdf: vi.fn().mockResolvedValue(undefined),
  buildParPdfDoc: vi.fn().mockResolvedValue({ save: vi.fn(), output: vi.fn() }),
  parPdfFileName: vi.fn().mockReturnValue("PAR_Form_test.pdf"),
  buildParHtml: vi.fn().mockReturnValue("<div></div>"),
}));

vi.mock("@/lib/api/par", () => ({
  getPar: (...args: unknown[]) => mockGetPar(...args),
  getParMe: (...args: unknown[]) => mockGetParMe(...args),
  uploadAttachment: vi.fn(),
  approvePar: vi.fn(),
  rejectPar: vi.fn(),
  requestParChanges: vi.fn(),
  submitPar: vi.fn(),
  reopenPar: vi.fn(),
  withdrawPar: vi.fn(),
  duplicatePar: vi.fn(),
  downloadDosar: vi.fn(),
  reapproveOverage: vi.fn(),
  getPurchaseOrder: vi.fn().mockResolvedValue(null),
  // Marcat distinct: dacă o sumă a cererii mai trece pe aici, se vede în aserțiuni.
  formatMDL: (c: number) => `${(c / 100).toFixed(2)} LEI`,
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

const usdPar: ParDetail = {
  id: "par-usd",
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0042",
  dateOfRequest: "2026-06-10",
  requestedByUserId: "user-requestor",
  payerId: null,
  requestorTitle: null,
  requestorCode: null,
  departmentId: null,
  dateNeeded: "2026-06-15",
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: "Servicii de instruire",
  vendorId: null,
  payeeName: "Vector Academy",
  payeeIdnp: null,
  payeeIban: null,
  payeeBank: null,
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "USD",
  totalEstimatedCents: 150000,
  exchangeRate: null,
  totalMdlCents: null,
  status: "paid",
  submittedAt: "2026-06-10",
  approvedAt: "2026-06-11",
  paidAt: "2026-06-12",
  cancelledAt: null,
  createdAt: "2026-06-10",
  updatedAt: "2026-06-12",
  line_items: [
    {
      id: "li-1",
      tenantId: "tenant-1",
      parId: "par-usd",
      position: 1,
      description: "Servicii de instruire pentru 150 participanți",
      quantity: 1,
      unit: "servicii",
      unitPriceCents: 150000,
      lineTotalCents: 150000,
      createdAt: "2026-06-10",
      updatedAt: "2026-06-10",
    },
  ],
  approvals: [],
  attachments: [],
  payment: {
    id: "pay-1",
    parBl: "BL-042",
    receivedAt: "2026-06-11",
    receivedByUserId: "user-finance",
    assignedToUserId: "user-finance",
    actualAmountCents: 150000,
    paymentDate: "2026-06-12",
    paymentRef: "TRN-42",
    proofUrl: null,
    overageReapproved: false,
  },
} as ParDetail;

describe("ParDetail — sumele unei cereri în valută", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPar.mockResolvedValue(usdPar);
    mockGetParMe.mockResolvedValue({ roles: ["finance"], userId: "user-finance", tenantId: "tenant-1" });
  });

  it("[blocant] prețul unitar și totalul liniei se scriu în USD, nu în lei", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const table = await waitFor(() => screen.getByLabelText("Articole solicitate"), { timeout: 10000 });

    // Preț unitar + total linie + TOTAL ESTIMAT — toate în moneda cererii.
    expect(within(table).getAllByText(/1\.500,00\s*USD/)).toHaveLength(3);
    expect(within(table).queryByText(/LEI/)).toBeNull();
  }, 20000);

  it("suma reală plătită păstrează moneda cererii", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await waitFor(() => expect(screen.getByText("Sumă reală")).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.queryByText(/LEI/)).toBeNull();
  }, 20000);
});
