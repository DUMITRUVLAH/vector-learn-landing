/**
 * CASH-004 — UI registru plăți + AllocationModal
 *
 * T-CASH-004-1 [blocant]: PaymentsPage renderează fără crash (tabel + donut)
 * T-CASH-004-2 [blocant]: AllocationModal — supraalocare dezactivează butonul Salvează
 * T-CASH-004-3 [normal]: tab Nepotrivite → buton Creează plată apelează API
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mocks ─────────────────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted — no top-level variable references allowed.
// Use inline literals inside the factory.

vi.mock("../../lib/api/finCashAllocations", () => ({
  getPayments: vi.fn().mockResolvedValue({
    payments: [
      {
        id: "pay-001",
        tenantId: "t1",
        partyId: "party-A",
        receivedDate: "2026-06-01",
        amountCents: 50000,
        currency: "MDL",
        accountLabel: "MAIB MDL",
        allocatedCents: 30000,
        unallocatedCents: 20000,
        bankTxId: null,
        notes: null,
        createdAt: "2026-06-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
  }),
  ignoreTransaction: vi.fn().mockResolvedValue({ ok: true }),
  createPaymentFromTx: vi.fn().mockResolvedValue({
    payment: {
      id: "pay-002",
      tenantId: "t1",
      partyId: null,
      receivedDate: "2026-06-10",
      amountCents: 15000,
      currency: "MDL",
      accountLabel: "MAIB MDL",
      allocatedCents: 0,
      unallocatedCents: 15000,
      bankTxId: "tx-001",
      notes: null,
      createdAt: "2026-06-10T00:00:00Z",
    },
  }),
  allocatePayment: vi.fn().mockResolvedValue({
    payment: {
      id: "pay-001",
      tenantId: "t1",
      partyId: "party-A",
      receivedDate: "2026-06-01",
      amountCents: 50000,
      currency: "MDL",
      accountLabel: "MAIB MDL",
      allocatedCents: 45000,
      unallocatedCents: 5000,
      bankTxId: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00Z",
    },
    allocation: { id: "alloc-001", amountCents: 15000 },
  }),
}));

vi.mock("../../lib/api/finCash", () => ({
  getUnmatched: vi.fn().mockResolvedValue({
    transactions: [
      {
        id: "tx-001",
        tenantId: "t1",
        accountLabel: "MAIB MDL",
        txDate: "2026-06-10",
        amountCents: 15000,
        currency: "MDL",
        reference: "INV-0042",
        counterparty: "Omega SRL",
        direction: "in",
        importBatchId: "batch-1",
        matchStatus: "unmatched",
        matchScoreBp: 0,
        createdAt: "2026-06-10T00:00:00Z",
      },
    ],
    total: 1,
  }),
  MATCH_STATUS_LABELS: {
    unmatched: "Nereconsiliat",
    matched: "Reconsiliat",
    duplicate: "Duplicat",
    ignored: "Ignorat",
  },
  DIRECTION_LABELS: { in: "Intrare", out: "Ieșire" },
}));

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/payments", navigate: vi.fn() }),
}));

vi.mock("../../components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// Recharts needs special handling in jsdom
vi.mock("recharts", () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import PaymentsPage from "../../pages/fin/PaymentsPage";
import { AllocationModal } from "../../components/fin/AllocationModal";
import { allocatePayment } from "../../lib/api/finCashAllocations";
import { createPaymentFromTx } from "../../lib/api/finCashAllocations";

// Base payment for modal tests
const basePayment = {
  id: "pay-001",
  tenantId: "t1",
  partyId: "party-A",
  receivedDate: "2026-06-01",
  amountCents: 50000,
  currency: "MDL",
  accountLabel: "MAIB MDL",
  allocatedCents: 30000,
  unallocatedCents: 20000,
  bankTxId: null,
  notes: null,
  createdAt: "2026-06-01T00:00:00Z",
};

// ─── T-CASH-004-1: PaymentsPage renders without crash ─────────────────────────

describe("CASH-004 — PaymentsPage", () => {
  it("T-CASH-004-1 [blocant] — renderează fără crash: titlu + structură", async () => {
    render(<PaymentsPage />);

    // Header should be present
    expect(screen.getByText(/Registru Plăți/i)).toBeInTheDocument();

    // Tabs
    expect(screen.getByRole("tab", { name: /^Plăți$/i })).toBeInTheDocument();
  });

  it("T-CASH-004-1b [blocant] — afișează butonul Alocă după încărcarea datelor", async () => {
    render(<PaymentsPage />);

    await waitFor(() => {
      // Should show Alocă button for a partially allocated payment
      expect(screen.getByRole("button", { name: /Alocă plata/i })).toBeInTheDocument();
    });
  });
});

// ─── T-CASH-004-2: AllocationModal — supraalocare dezactivează butonul ────────

describe("CASH-004 — AllocationModal", () => {
  it("T-CASH-004-2 [blocant] — butonul Salvează e disabled când suma depășește creditul disponibil", () => {
    render(
      <AllocationModal
        payment={basePayment}
        onClose={vi.fn()}
        onAllocated={vi.fn()}
      />
    );

    const invoiceInput = screen.getByLabelText(/ID Factură/i);
    const amountInput = screen.getByLabelText(/Sumă de alocat/i);
    const saveBtn = screen.getByRole("button", { name: /Salvează/i });

    // Fill valid invoice ID
    fireEvent.change(invoiceInput, {
      target: { value: "00000000-0000-0000-0000-000000000001" },
    });

    // Enter amount OVER the limit (200 MDL = 20000 cenți)
    fireEvent.change(amountInput, { target: { value: "300" } }); // 300 MDL > 200 MDL

    // Save button must be disabled
    expect(saveBtn).toHaveAttribute("aria-disabled", "true");

    // Error message should appear
    expect(screen.getByText(/depășește creditul disponibil/i)).toBeInTheDocument();
  });

  it("butonul Salvează e activ când suma e validă", () => {
    render(
      <AllocationModal
        payment={basePayment}
        onClose={vi.fn()}
        onAllocated={vi.fn()}
      />
    );

    const invoiceInput = screen.getByLabelText(/ID Factură/i);
    const amountInput = screen.getByLabelText(/Sumă de alocat/i);
    const saveBtn = screen.getByRole("button", { name: /Salvează/i });

    fireEvent.change(invoiceInput, {
      target: { value: "00000000-0000-0000-0000-000000000001" },
    });
    fireEvent.change(amountInput, { target: { value: "100" } }); // 100 MDL < 200 MDL

    expect(saveBtn).toHaveAttribute("aria-disabled", "false");
  });

  it("apelează allocatePayment la submit valid", async () => {
    const onAllocated = vi.fn();

    render(
      <AllocationModal
        payment={basePayment}
        onClose={vi.fn()}
        onAllocated={onAllocated}
      />
    );

    fireEvent.change(screen.getByLabelText(/ID Factură/i), {
      target: { value: "00000000-0000-0000-0000-000000000001" },
    });
    fireEvent.change(screen.getByLabelText(/Sumă de alocat/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Salvează/i }));

    await waitFor(() => {
      expect(allocatePayment).toHaveBeenCalledWith(basePayment.id, {
        invoiceId: "00000000-0000-0000-0000-000000000001",
        amountCents: 10000,
      });
    });
  });
});

// ─── T-CASH-004-3: tab Nepotrivite → Creează plată apelează API ──────────────

describe("CASH-004 — Tab Nepotrivite", () => {
  it("T-CASH-004-3 [normal] — butonul Creează plată apelează createPaymentFromTx", async () => {
    render(<PaymentsPage />);

    // Switch to unmatched tab
    const tabs = screen.getAllByRole("tab");
    const unmatchedTab = tabs.find((t) => t.textContent?.includes("Nepotrivite"));
    if (!unmatchedTab) throw new Error("Unmatched tab not found");
    fireEvent.click(unmatchedTab);

    // Wait for unmatched to load
    await waitFor(() => {
      expect(screen.getByText(/Creează plată/i)).toBeInTheDocument();
    });

    // Click "Creează plată"
    fireEvent.click(screen.getByText(/Creează plată/i));

    await waitFor(() => {
      expect(createPaymentFromTx).toHaveBeenCalledWith("tx-001");
    });
  });
});
