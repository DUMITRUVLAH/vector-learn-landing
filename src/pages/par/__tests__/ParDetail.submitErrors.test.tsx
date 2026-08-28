/**
 * Regresie 2026-08-28 (raportat de Violeta Bordeniuc, workspace ATIC / proiect Digital Safeguard):
 * ciorna PAR-2026-0004 nu putea fi trimisă spre aprobare, iar pagina afișa doar banda roșie cu
 * textul brut „validation_failed". Autorul nu avea CUM să afle ce lipsește (îi lipseau scopul
 * utilizării finale și beneficiarul), iar o altă ciornă completă trecea — de unde „de ce așa?".
 *
 * Testul apasă butonul REAL și verifică motivele afișate, nu doar că butonul există (CLAUDE.md
 * §3.5.1quater: testăm acțiunea, nu doar afordanța).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import type { ParDetail } from "@/lib/api/par";

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();
const mockSubmitPar = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/par-draft-id", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/par/ParTimeline", () => ({ ParTimeline: () => <div /> }));
vi.mock("@/components/par/ParStatusChip", () => ({ ParStatusChip: () => <span /> }));
vi.mock("@/components/par/ParApprovalChain", () => ({ ParApprovalChain: () => <div /> }));
vi.mock("@/lib/parPdf", () => ({
  downloadParPdf: vi.fn().mockResolvedValue(undefined),
  buildParHtml: vi.fn().mockReturnValue("<div></div>"),
}));

vi.mock("@/lib/api/par", () => ({
  getPar: (...a: unknown[]) => mockGetPar(...a),
  getParMe: (...a: unknown[]) => mockGetParMe(...a),
  submitPar: (...a: unknown[]) => mockSubmitPar(...a),
  uploadAttachment: vi.fn(),
  approvePar: vi.fn().mockResolvedValue({}),
  rejectPar: vi.fn().mockResolvedValue({}),
  requestParChanges: vi.fn().mockResolvedValue({}),
  reapproveOverage: vi.fn().mockResolvedValue({}),
  getPurchaseOrder: vi.fn().mockResolvedValue(null),
  formatMDL: (c: number) => `${(c / 100).toLocaleString()} MDL`,
  PAR_STATUS_LABELS: { draft: "Ciornă" },
}));

/** Ciorna reală: are un articol și un total, dar fără scop și fără beneficiar. */
const draftPar = {
  id: "par-draft-id",
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0004",
  dateOfRequest: "2026-08-28",
  requestedByUserId: "user-requestor",
  payerId: null,
  requestorTitle: null,
  requestorCode: null,
  departmentId: null,
  dateNeeded: null,
  projectId: "proj-1",
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
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
  totalEstimatedCents: 2340200,
  status: "draft",
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-08-28",
  updatedAt: "2026-08-28",
  requestedByName: "Violeta Bordeniuc",
  departmentName: null,
  payerName: "ATIC",
  projectName: "Digital Safeguard",
  line_items: [
    {
      id: "li-1",
      tenantId: "tenant-1",
      parId: "par-draft-id",
      position: 1,
      description: "bilet avia Lisabona",
      quantity: 2,
      unit: "servicii",
      unitPriceCents: 1170100,
      lineTotalCents: 2340200,
      createdAt: "2026-08-28",
      updatedAt: "2026-08-28",
    },
  ],
  approvals: [],
  attachments: [],
  payment: null,
} as unknown as ParDetail;

describe("ParDetailPage — de ce nu se trimite ciorna", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPar.mockResolvedValue(draftPar);
    mockGetParMe.mockResolvedValue({ roles: ["requestor"], userId: "user-requestor", tenantId: "tenant-1" });
    mockSubmitPar.mockRejectedValue(
      new ApiError(400, "validation_failed", undefined, [
        { field: "end_use", message: "End use description is required for execute_payment" },
        { field: "payee", message: "Payee (vendor or inline name + IBAN) is required for execute_payment" },
      ])
    );
  });

  it("[blocant] arată motivele concrete, nu codul brut „validation_failed”", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const btn = await screen.findByLabelText("Trimite cererea spre aprobare", {}, { timeout: 10000 });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockSubmitPar).toHaveBeenCalledWith("par-draft-id");
      expect(screen.getByText(/Completează „Descrierea utilizării finale”/)).toBeDefined();
      expect(screen.getByText(/Completează beneficiarul: nume \+ IBAN/)).toBeDefined();
    }, { timeout: 10000 });

    // Codul brut nu mai ajunge niciodată la utilizator.
    expect(screen.queryByText("validation_failed")).toBeNull();
    // …și există o cale directă spre completare.
    expect(screen.getByText("Deschide cererea pentru completare")).toBeDefined();
  });
});
