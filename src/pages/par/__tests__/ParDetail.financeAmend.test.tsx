/**
 * Completarea de după semnare, pe fișa cererii (cerere manager financiar, 22.09.2026).
 *
 * Ce verifică, în ordinea importanței:
 *   1. finanțele chiar POT schimba linia de buget pe o cerere semnată — și ce pleacă la server e
 *      exact linia de buget, nu tot formularul (testăm ACȚIUNEA, nu prezența butonului);
 *   2. solicitantul și aprobatorul NU văd completarea, nici pe cererea lor;
 *   3. înainte de semnare nu apare nimic — cât timp cererea se semnează, ea se retrage, nu se
 *      completează pe la spate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ParDetail } from "@/lib/api/par";

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();
const mockUpdatePar = vi.fn();
const mockListBudgetCodes = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/par-test-id", navigate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));
vi.mock("@/components/par/ParTimeline", () => ({ ParTimeline: () => <div /> }));
vi.mock("@/components/par/ParStatusChip", () => ({ ParStatusChip: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/components/par/ParApprovalChain", () => ({ ParApprovalChain: () => <div /> }));
vi.mock("@/lib/parPdf", () => ({
  downloadParPdf: vi.fn(),
  buildParPdfDoc: vi.fn(),
  parPdfFileName: vi.fn().mockReturnValue("x.pdf"),
  buildParHtml: vi.fn().mockReturnValue("<div></div>"),
}));

vi.mock("@/lib/api/par", () => ({
  getPar: (...a: unknown[]) => mockGetPar(...a),
  getParMe: (...a: unknown[]) => mockGetParMe(...a),
  updatePar: (...a: unknown[]) => mockUpdatePar(...a),
  listBudgetCodes: (...a: unknown[]) => mockListBudgetCodes(...a),
  uploadAttachmentDirect: vi.fn().mockResolvedValue({ id: "att-2" }),
  reconcileInBackground: vi.fn(),
  getParTimeline: vi.fn().mockResolvedValue({ timeline: [], total: 0 }),
  uploadAttachment: vi.fn(),
  approvePar: vi.fn().mockResolvedValue({}),
  rejectPar: vi.fn().mockResolvedValue({}),
  requestParChanges: vi.fn().mockResolvedValue({}),
  submitPar: vi.fn().mockResolvedValue({}),
  reopenPar: vi.fn().mockResolvedValue({}),
  withdrawPar: vi.fn().mockResolvedValue({}),
  unpayPar: vi.fn().mockResolvedValue({}),
  financeReturnPar: vi.fn().mockResolvedValue({}),
  duplicatePar: vi.fn().mockResolvedValue({}),
  downloadDosar: vi.fn(),
  reapproveOverage: vi.fn().mockResolvedValue({}),
  getPurchaseOrder: vi.fn().mockResolvedValue(null),
  getThreeWayMatch: vi.fn().mockResolvedValue(null),
  checkTenderThreshold: vi.fn().mockResolvedValue({
    applies: false, exceeds: false, warn: false, cleared: false,
    thresholdCents: 0, yearToDateCents: 0, projectedCents: 0, overByCents: 0, year: 2026,
  }),
  clearTender: vi.fn().mockResolvedValue({}),
  getParVerifyCode: vi.fn().mockResolvedValue(null),
  setParVerifyCode: vi.fn().mockResolvedValue(null),
  downloadParForm: vi.fn(),
  formatMDL: (c: number) => `${(c / 100).toLocaleString()} MDL`,
  PAR_STATUS_LABELS: { approved: "Aprobată", pending_approval: "În aprobare", paid: "Plătită" },
}));

const signedPar = {
  id: "par-test-id",
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0007",
  dateOfRequest: "2026-09-10",
  requestedByUserId: "user-requestor",
  payerId: "payer-1",
  requestorTitle: "Coordonator",
  requestorCode: "M1",
  departmentId: "dept-1",
  dateNeeded: null,
  projectId: "proj-1",
  budgetCodeId: "bc-1",
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: null,
  vendorId: null,
  payeeName: "Furnizor SRL",
  payeeIdnp: "1002600012345",
  payeeIban: "MD24AG000225100013104168",
  payeeBank: "VB",
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 50000,
  status: "approved",
  submittedAt: "2026-09-10",
  approvedAt: "2026-09-11",
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-10",
  updatedAt: "2026-09-11",
  requestedByName: "Ana Popa",
  budgetCodeLabel: "6-1-01 — Traduceri",
  line_items: [],
  approvals: [],
  attachments: [],
  payment: null,
} as unknown as ParDetail;

const FINANCE = { roles: ["finance"], userId: "user-finance", tenantId: "tenant-1" };

describe("Fișa PAR — completarea de după semnare (finanțe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPar.mockResolvedValue(signedPar);
    mockGetParMe.mockResolvedValue(FINANCE);
    mockUpdatePar.mockResolvedValue({});
    mockListBudgetCodes.mockResolvedValue({
      items: [
        { id: "bc-1", payerId: "payer-1", projectId: "proj-1", code: "6-1-01", name: "Traduceri", active: true },
        { id: "bc-2", payerId: "payer-1", projectId: null, code: "6-2-03", name: "Administrativ", active: true },
        // Codul altui proiect nu are ce căuta în listă — serverul l-ar refuza oricum.
        { id: "bc-3", payerId: "payer-1", projectId: "proj-9", code: "9-9-99", name: "Alt proiect", active: true },
      ],
    });
  });

  it("[blocant] finanțele schimbă linia de buget, iar la server pleacă DOAR linia de buget", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const trigger = await screen.findByText("Schimbă linia de buget", {}, { timeout: 10000 });
    fireEvent.click(trigger);

    const combo = await screen.findByLabelText("Cod bugetar");
    fireEvent.change(combo, { target: { value: "6-2-03" } });
    const option = await screen.findByText("6-2-03");
    fireEvent.click(option);

    fireEvent.change(screen.getByLabelText("Notă la linia de buget"), {
      target: { value: "mutat pe linia corectă" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(mockUpdatePar).toHaveBeenCalled());
    const [id, payload] = mockUpdatePar.mock.calls[0];
    expect(id).toBe("par-test-id");
    expect(payload).toEqual({ budget_code_id: "bc-2", budget_code_note: "mutat pe linia corectă" });
    // Ce nu are voie să plece nici din greșeală: banii.
    expect(Object.keys(payload)).not.toContain("currency");
    expect(Object.keys(payload)).not.toContain("payee_iban");
  }, 20000);

  it("[blocant] finanțele adaugă descrierea lipsă", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const trigger = await screen.findByText("Adaugă descriere", {}, { timeout: 10000 });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Scopul și descrierea utilizării finale"), {
      target: { value: "Traduceri pentru atelierul din septembrie." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(mockUpdatePar).toHaveBeenCalledWith("par-test-id", {
      end_use: "Traduceri pentru atelierul din septembrie.",
    }));
  }, 20000);

  it("finanțele pot insera acte adiționale la dosar", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const trigger = await screen.findByText("Adaugă act adițional la dosar", {}, { timeout: 10000 });
    fireEvent.click(trigger);
    expect(await screen.findByLabelText("Tipul documentului")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Act adițional")).toBeInTheDocument();
  }, 20000);

  it("[blocant] solicitantul nu vede completarea pe cererea lui semnată", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["requestor"], userId: "user-requestor", tenantId: "tenant-1" });
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await screen.findByText("PAR-2026-0007", {}, { timeout: 10000 });
    expect(screen.queryByText("Schimbă linia de buget")).not.toBeInTheDocument();
    expect(screen.queryByText("Adaugă descriere")).not.toBeInTheDocument();
    expect(screen.queryByText("Adaugă act adițional la dosar")).not.toBeInTheDocument();
  }, 20000);

  it("[blocant] aprobatorul nu vede completarea — e rolul finanțelor", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["approver"], userId: "user-approver", tenantId: "tenant-1" });
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await screen.findByText("PAR-2026-0007", {}, { timeout: 10000 });
    expect(screen.queryByText("Schimbă linia de buget")).not.toBeInTheDocument();
  }, 20000);

  it("[blocant] cât timp cererea se semnează, finanțele nu o pot completa", async () => {
    mockGetPar.mockResolvedValue({ ...signedPar, status: "pending_approval", approvedAt: null } as ParDetail);
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await screen.findByText("PAR-2026-0007", {}, { timeout: 10000 });
    expect(screen.queryByText("Schimbă linia de buget")).not.toBeInTheDocument();
  }, 20000);

  it("cine a semnat vede pe fișă că s-a completat ulterior", async () => {
    mockGetPar.mockResolvedValue({
      ...signedPar,
      finance_amendments: [
        { at: "2026-09-20T09:00:00.000Z", byName: "Violeta B.", fields: ["linia de buget"] },
      ],
    } as ParDetail);
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const notice = await screen.findByText(/Completat de finanțe după semnare/, {}, { timeout: 10000 });
    expect(notice.textContent).toContain("Violeta B.");
    expect(notice.textContent).toContain("linia de buget");
  }, 20000);
});
