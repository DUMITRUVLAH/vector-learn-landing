/**
 * CAPTURE-003 — UI confirmare câmpuri extrase AI
 *
 * T-CAPTURE-003-1 [blocant]: pagina se randează fără crash cu captură extracted
 * T-CAPTURE-003-2 [blocant]: buton dezactivat dacă amount_cents lipsește
 * T-CAPTURE-003-3 [blocant]: POST confirm trimite câmpurile editate (nu AI originale)
 * T-CAPTURE-003-4 [normal]: badge de încredere verde/amber/roșu afișat corect
 * T-CAPTURE-003-5 [normal]: status processing → spinner data-testid="processing-spinner"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CapturePage from "../../pages/fin/CapturePage";
import { ConfidenceBadge } from "../../components/fin/ConfidenceBadge";

// ─── Mock deps ────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/captures/cap-1", navigate: mockNavigate }),
}));

const mockGetCapture = vi.fn();
const mockConfirmCapture = vi.fn();
vi.mock("../../lib/api/finCaptures", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api/finCaptures")>();
  return {
    ...actual,
    getCapture: (...args: unknown[]) => mockGetCapture(...args),
    confirmCapture: (...args: unknown[]) => mockConfirmCapture(...args),
  };
});

vi.mock("../../components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const extractedCapture = {
  id: "cap-1",
  tenantId: "tenant-1",
  expenseId: null,
  fileKey: "demo/bon.jpg",
  fileName: "bon.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 12345,
  status: "extracted" as const,
  extractedFields: {
    vendor_name: { value: "Lidl SRL", confidence: 0.94 },
    amount_cents: { value: 23700, confidence: 0.97 },
    vat_amount_cents: { value: 4100, confidence: 0.85 },
    vat_deductible: { value: false, confidence: 0.52, low_confidence: true },
    expense_date: { value: "2026-06-14", confidence: 0.90 },
    category: { value: "supplies", confidence: 0.72 },
    reference: { value: null, confidence: 0 },
    iban: { value: null, confidence: 0 },
  },
  rawText: "LIDL 237.00 MDL",
  errorMessage: null,
  confirmedBy: null,
  confirmedAt: null,
  createdBy: "user-1",
  createdAt: "2026-06-14T10:00:00Z",
  updatedAt: "2026-06-14T10:00:00Z",
};

const processingCapture = {
  ...extractedCapture,
  status: "processing" as const,
  extractedFields: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CAPTURE-003 — CapturePage UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
  });

  it("T-CAPTURE-003-1 [blocant] — renderează fără crash cu captură extracted", async () => {
    mockGetCapture.mockResolvedValue(extractedCapture);

    render(<CapturePage captureId="cap-1" />);

    // Nu aruncă excepție; titlul fișierului apare
    await waitFor(() => {
      expect(screen.getByText("bon.jpg")).toBeInTheDocument();
    });

    // Butonul Confirmă există
    expect(screen.getByRole("button", { name: /confirmă cheltuiala/i })).toBeInTheDocument();

    // Câmpurile principale sunt vizibile
    expect(screen.getByLabelText(/furnizor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sumă în mdl/i)).toBeInTheDocument();
  });

  it("T-CAPTURE-003-2 [blocant] — buton dezactivat dacă suma lipsește", async () => {
    const captureWithoutAmount = {
      ...extractedCapture,
      extractedFields: {
        ...extractedCapture.extractedFields,
        amount_cents: { value: null, confidence: 0 },
      },
    };
    mockGetCapture.mockResolvedValue(captureWithoutAmount);

    render(<CapturePage captureId="cap-1" />);

    await waitFor(() => {
      expect(screen.getByText("bon.jpg")).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirmă cheltuiala/i });
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/suma obligatorie/i)).toBeInTheDocument();
  });

  it("T-CAPTURE-003-3 [blocant] — confirm trimite câmpurile editate", async () => {
    mockGetCapture.mockResolvedValue(extractedCapture);
    mockConfirmCapture.mockResolvedValue({
      capture: { ...extractedCapture, status: "confirmed", expenseId: "exp-1" },
      expenseId: "exp-1",
      message: "Captură confirmată. Cheltuiala a fost creată în draft.",
    });

    render(<CapturePage captureId="cap-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText(/furnizor/i)).toBeInTheDocument();
    });

    // Editează furnizorul
    const vendorInput = screen.getByLabelText(/furnizor/i);
    fireEvent.change(vendorInput, { target: { value: "Metro SRL" } });

    // Click Confirmă
    const confirmBtn = screen.getByRole("button", { name: /confirmă cheltuiala/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockConfirmCapture).toHaveBeenCalledWith(
        "cap-1",
        expect.objectContaining({
          fields: expect.objectContaining({
            vendor_name: "Metro SRL", // valoarea editată
            amount_cents: 23700,
          }),
        })
      );
    });
  });

  it("T-CAPTURE-003-5 [normal] — status processing → spinner cu data-testid", async () => {
    mockGetCapture.mockResolvedValue(processingCapture);

    render(<CapturePage captureId="cap-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("processing-spinner")).toBeInTheDocument();
    });
  });
});

describe("CAPTURE-003 — ConfidenceBadge", () => {
  it("T-CAPTURE-003-4 [normal] — verde ≥0.85, amber 0.60–0.84, roșu <0.60", () => {
    const { rerender } = render(<ConfidenceBadge confidence={0.94} />);
    // Verde — clasa conține green
    const badge = document.querySelector('[aria-label*="ridicată"]');
    expect(badge).toBeTruthy();
    expect(badge?.className).toMatch(/green/);

    rerender(<ConfidenceBadge confidence={0.72} />);
    const ambBadge = document.querySelector('[aria-label*="medie"]');
    expect(ambBadge).toBeTruthy();
    expect(ambBadge?.className).toMatch(/amber/);

    rerender(<ConfidenceBadge confidence={0.45} />);
    const redBadge = document.querySelector('[aria-label*="scăzută"]');
    expect(redBadge).toBeTruthy();
    expect(redBadge?.className).toMatch(/red/);
  });
});
