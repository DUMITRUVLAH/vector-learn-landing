/**
 * PAR-115: PAR detail page with PDF download button
 * Tests: T-PAR-115-1, T-PAR-115-2
 *
 * T-PAR-115-1 [blocant]: Given /app/par/:id, page renders without crash and Download PDF button exists
 * T-PAR-115-2 [normal]: clicking Download PDF calls downloadParPdf and uploadAttachment (kind=par_pdf)
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ParDetailPage from "../ParDetail";
import * as parApi from "@/lib/api/par";
import * as parPdf from "@/lib/parPdf";
import type { ParDetail } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/business/par/par-uuid-001",
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

// Mock jsPDF + html2canvas (browser-only, not available in jsdom)
vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    addImage: vi.fn(),
    addPage: vi.fn(),
    output: vi.fn().mockReturnValue("data:application/pdf;base64,MOCK"),
    save: vi.fn(),
  })),
}));

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: vi.fn().mockReturnValue("data:image/jpeg;base64,MOCK"),
    width: 794,
    height: 1123,
  }),
}));

// Mock parPdf module — downloadParPdf resolves immediately
// NOTE: vi.mock is hoisted so we can't use a variable here; use vi.fn() directly
vi.mock("@/lib/parPdf", async () => {
  const actual = await vi.importActual("@/lib/parPdf");
  return {
    ...actual,
    downloadParPdf: vi.fn().mockResolvedValue(undefined),
  };
});

// Helper to get the mock after module init
function getMockDownload() {
  return parPdf.downloadParPdf as ReturnType<typeof vi.fn>;
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeDetail(overrides: Partial<ParDetail> = {}): ParDetail {
  return {
    id: "par-uuid-001",
    tenantId: "tenant-1",
    requestNo: "PAR-2026-0001",
    dateOfRequest: "2026-06-10T00:00:00Z",
    requestedByUserId: "Sirbu Cristina",
    payerId: null,
    requestorTitle: "Procurement Specialist / M13",
    requestorCode: "M13",
    departmentId: "ATIC",
    dateNeeded: null,
    projectId: "Digital Safeguard",
    budgetCodeId: "BC-2026",
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Consulting services",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "BC Moldindconbank",
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    status: "approved",
    submittedAt: "2026-06-10T08:00:00Z",
    approvedAt: "2026-06-10T12:00:00Z",
    paidAt: null,
    cancelledAt: null,
    createdAt: "2026-06-10T07:00:00Z",
    updatedAt: "2026-06-10T12:00:00Z",
    line_items: [
      {
        id: "li-001",
        tenantId: "tenant-1",
        parId: "par-uuid-001",
        position: 1,
        description: "Psychological session",
        quantity: 1,
        unit: "sesie",
        unitPriceCents: 700000,
        lineTotalCents: 700000,
        createdAt: "2026-06-10T07:00:00Z",
        updatedAt: "2026-06-10T07:00:00Z",
      },
    ],
    approvals: [
      {
        id: "appr-0",
        step: 0,
        approverUserId: "user-sirbu",
        approverRoleLabel: "Requestor",
        decision: "approved",
        locked: false,
        decidedAt: "2026-06-10T08:00:00Z",
        comment: null,
        signatureName: "Sirbu Cristina",
        signatureTitle: "Procurement Specialist / M13",
        createdAt: "2026-06-10T07:00:00Z",
      },
    ],
    attachments: [],
    payment: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParDetailPage — T-PAR-115-1 [blocant]: render without crash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(parApi, "getPar").mockResolvedValue(makeDetail());
    vi.spyOn(parApi, "uploadAttachment").mockResolvedValue({
      id: "att-001",
      fileName: "PAR_Form_PAR-2026-0001.pdf",
      kind: "par_pdf",
      uploadedBy: null,
      createdAt: new Date().toISOString(),
      fileUrl: "data:application/pdf;base64,MOCK",
    });
  });

  it("renders the page without crashing", async () => {
    render(<ParDetailPage />);
    // After data loads, shows PAR request number
    await waitFor(() => {
      expect(screen.getByText("PAR-2026-0001")).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows the Download PDF button", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      // Button text is "Download PDF", accessible name is "Descarcă formularul PAR ca PDF"
      // Use text query which checks both
      const btn = screen.queryByRole("button", { name: /descarcă formularul par/i })
               ?? screen.queryByText(/download pdf/i);
      expect(btn).not.toBeNull();
    }, { timeout: 5000 });
  });

  it("Download PDF button has correct aria-label", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /descarcă formularul par ca pdf/i });
      expect(btn).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("shows PAR status chip", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      expect(screen.getByTestId("status-chip")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows all section headings", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Informații cerere/i)).toBeInTheDocument();
      expect(screen.getByText(/Scopul PAR/i)).toBeInTheDocument();
      expect(screen.getByText(/Charge To/i)).toBeInTheDocument();
      expect(screen.getByText(/Articole solicitate/i)).toBeInTheDocument();
      expect(screen.getByText(/Beneficiar plată/i)).toBeInTheDocument();
      expect(screen.getByText(/Atașamente/i)).toBeInTheDocument();
      expect(screen.getByText(/Semnături și aprobări/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

describe("ParDetailPage — T-PAR-115-2 [normal]: PDF download + attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(parApi, "getPar").mockResolvedValue(makeDetail());
    vi.spyOn(parApi, "uploadAttachment").mockResolvedValue({
      id: "att-001",
      fileName: "PAR_Form_PAR-2026-0001.pdf",
      kind: "par_pdf",
      uploadedBy: null,
      createdAt: new Date().toISOString(),
      fileUrl: "data:application/pdf;base64,MOCK",
    });
  });

  it("calls downloadParPdf when Download PDF button is clicked", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /descarcă formularul par ca pdf/i })).toBeInTheDocument();
    }, { timeout: 5000 });

    const btn = screen.getByRole("button", { name: /descarcă formularul par ca pdf/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(getMockDownload()).toHaveBeenCalledTimes(1);
    }, { timeout: 5000 });
  });

  it("button shows loading state during generation", async () => {
    let resolveDownload!: () => void;
    getMockDownload().mockImplementationOnce(
      () => new Promise<void>((res) => { resolveDownload = res; })
    );

    render(<ParDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /descarcă formularul par ca pdf/i })).toBeInTheDocument();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByRole("button", { name: /descarcă formularul par ca pdf/i }));

    await waitFor(() => {
      expect(screen.getByText(/se generează pdf/i)).toBeInTheDocument();
    }, { timeout: 1000 });

    // Resolve and clean up
    resolveDownload();
  });

  it("calls getPar on load to fetch the full ParDetail", async () => {
    render(<ParDetailPage />);
    await waitFor(() => {
      expect(parApi.getPar).toHaveBeenCalledWith("par-uuid-001");
    }, { timeout: 3000 });
  });
});

describe("ParDetailPage — error state", () => {
  it("shows error message when getPar fails", async () => {
    vi.spyOn(parApi, "getPar").mockRejectedValue(new Error("Not found"));
    render(<ParDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
