/**
 * Verificatorul solicitantului, pe fișa cererii (cerere owner, 23.09.2026 — Iulian verifică
 * cererile Cristinei Onicov și Marinei Certan înaintea aprobatorilor, le corectează sau întoarce).
 *
 * Ce verifică:
 *   1. verificatorul chiar POATE corecta linia de buget, evenimentul și data — și la server pleacă
 *      DOAR câmpul corectat (testăm ACȚIUNEA, nu prezența creionului);
 *   2. refuzul serverului se citește în română, nu ca un cod (`forbidden_for_verifier`);
 *   3. cine nu e verificator (steagul serverului `verifier_amend` e fals) nu vede nimic din toate astea;
 *   4. solicitantul vede pe fișă cine i-a corectat cererea și ce.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ParDetail } from "@/lib/api/par";
import { ApiError } from "@/lib/api";

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();
const mockUpdatePar = vi.fn();
const mockListBudgetCodes = vi.fn();
const mockListEvents = vi.fn();

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
  listEvents: (...a: unknown[]) => mockListEvents(...a),
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

const pendingPar = {
  id: "par-test-id",
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0070",
  dateOfRequest: "2026-09-23T00:00:00.000Z",
  requestedByUserId: "user-cristina",
  payerId: "payer-1",
  requestorTitle: "Asistent proiect",
  requestorCode: null,
  departmentId: null,
  dateNeeded: "2026-10-03T00:00:00.000Z",
  projectId: "proj-led3",
  eventId: null,
  budgetCodeId: "bc-1",
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: "Kituri Arduino",
  vendorId: null,
  payeeName: "Robotics Supply SRL",
  payeeIdnp: null,
  payeeIban: "MD24AG000225100013104168",
  payeeBank: null,
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 340090,
  status: "pending_approval",
  submittedAt: "2026-09-23",
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-09-23",
  updatedAt: "2026-09-23",
  requestedByName: "Cristina Onicov-Beselea",
  projectName: "LED 3/Youth Maker club",
  budgetCodeLabel: "2.1 — Deplasări",
  line_items: [],
  approvals: [],
  attachments: [],
  payment: null,
  verifier_amend: true,
} as unknown as ParDetail;

const IULIAN = { roles: ["requestor"], userId: "user-iulian", tenantId: "tenant-1", preApprover: true };

describe("Fișa PAR — verificatorul solicitantului", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPar.mockResolvedValue(pendingPar);
    mockGetParMe.mockResolvedValue(IULIAN);
    mockUpdatePar.mockResolvedValue({});
    mockListBudgetCodes.mockResolvedValue({
      items: [
        { id: "bc-1", payerId: "payer-1", projectId: "proj-led3", code: "2.1", name: "Deplasări", active: true },
        { id: "bc-2", payerId: "payer-1", projectId: "proj-led3", code: "3.4", name: "Materiale atelier", active: true },
        { id: "bc-9", payerId: "payer-1", projectId: "proj-ebrd", code: "9.9", name: "Alt proiect", active: true },
      ],
    });
    mockListEvents.mockResolvedValue({
      events: [
        { id: "ev-1", projectId: "proj-led3", name: "Atelier robotică", active: true },
        { id: "ev-9", projectId: "proj-ebrd", name: "Conferință EBRD", active: true },
      ],
    });
  });

  it("[blocant] verificatorul vede ce poate face, o singură dată, deasupra acțiunilor", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);
    const banner = await screen.findByText("Verifici cererea înainte să ajungă la aprobatori", {}, { timeout: 10000 });
    expect(banner.parentElement?.textContent).toContain("Cristina Onicov-Beselea");
    expect(banner.parentElement?.textContent).toContain("Cere modificări");
  }, 20000);

  it("[blocant] schimbă linia de buget, iar la server pleacă DOAR linia de buget", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    fireEvent.click(await screen.findByText("Schimbă linia de buget", {}, { timeout: 10000 }));
    const combo = await screen.findByLabelText("Cod bugetar");
    fireEvent.change(combo, { target: { value: "3.4" } });
    fireEvent.click(await screen.findByText("3.4"));
    // Codul altui proiect nu se oferă — serverul l-ar refuza oricum.
    expect(screen.queryByText("9.9")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(mockUpdatePar).toHaveBeenCalled());
    const [id, payload] = mockUpdatePar.mock.calls[0];
    expect(id).toBe("par-test-id");
    expect(payload).toEqual({ budget_code_id: "bc-2", budget_code_note: null });
  }, 20000);

  it("[blocant] alege evenimentul — doar din proiectul cererii", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    fireEvent.click(await screen.findByText("Alege evenimentul", {}, { timeout: 10000 }));
    const select = await screen.findByLabelText("Eveniment");
    await screen.findByRole("option", { name: "Atelier robotică" });
    expect(screen.queryByRole("option", { name: "Conferință EBRD" })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "ev-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(mockUpdatePar).toHaveBeenCalledWith("par-test-id", { event_id: "ev-1" }));
    expect(mockListEvents).toHaveBeenCalledWith("proj-led3");
  }, 20000);

  it("[blocant] mută data necesară", async () => {
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    fireEvent.click(await screen.findByText("Schimbă data", {}, { timeout: 10000 }));
    fireEvent.change(screen.getByLabelText("Data necesară"), { target: { value: "2026-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() =>
      expect(mockUpdatePar).toHaveBeenCalledWith("par-test-id", { date_needed: "2026-10-15T00:00:00.000Z" })
    );
  }, 20000);

  it("[blocant] refuzul serverului se citește în română, nu ca un cod", async () => {
    mockUpdatePar.mockRejectedValue(
      new ApiError(403, "forbidden_for_verifier", undefined, [], {
        error: "forbidden_for_verifier",
        detail: "Pasul tău de verificare s-a încheiat între timp.",
      })
    );
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    fireEvent.click(await screen.findByText("Schimbă data", {}, { timeout: 10000 }));
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByText("Pasul tău de verificare s-a încheiat între timp.")).toBeInTheDocument();
    expect(screen.queryByText("forbidden_for_verifier")).not.toBeInTheDocument();
  }, 20000);

  it("[blocant] fără steagul serverului, nimic: nici bandă, nici creioane", async () => {
    mockGetPar.mockResolvedValue({ ...pendingPar, verifier_amend: false } as ParDetail);
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    await screen.findByText("PAR-2026-0070", {}, { timeout: 10000 });
    expect(screen.queryByText("Verifici cererea înainte să ajungă la aprobatori")).not.toBeInTheDocument();
    expect(screen.queryByText("Schimbă linia de buget")).not.toBeInTheDocument();
    expect(screen.queryByText("Schimbă data")).not.toBeInTheDocument();
    expect(screen.queryByText("Alege evenimentul")).not.toBeInTheDocument();
  }, 20000);

  it("solicitantul vede pe fișă cine i-a corectat cererea și ce", async () => {
    mockGetParMe.mockResolvedValue({ roles: ["requestor"], userId: "user-cristina", tenantId: "tenant-1" });
    mockGetPar.mockResolvedValue({
      ...pendingPar,
      verifier_amend: false,
      verifier_amendments: [
        { at: "2026-09-23T12:00:00.000Z", byName: "Iulian Lungu", fields: ["linia de buget", "evenimentul"] },
      ],
    } as ParDetail);
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const notice = await screen.findByText(/Corectată la verificare/, {}, { timeout: 10000 });
    expect(notice.textContent).toContain("Iulian Lungu");
    expect(notice.textContent).toContain("linia de buget, evenimentul");
  }, 20000);
});
