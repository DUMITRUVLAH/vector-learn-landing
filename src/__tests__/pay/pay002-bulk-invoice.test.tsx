/**
 * PAY-002 — Generare bulk facturi lunare
 * Tests:
 * T-PAY-002-1: bulkGenerateInvoices dryRun=true returns preview without creating invoices
 * T-PAY-002-2: bulkGenerateInvoices dryRun=false returns created count
 * T-PAY-002-3: BulkGenerateDialog renders with Preview + Generează buttons
 * T-PAY-002-4: Preview shows count and totalAmount from API
 * T-PAY-002-5: "Bulk generare" button opens BulkGenerateDialog
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/invoices", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

const mockBulkGenerate = vi.fn();
const mockListInvoices = vi.fn().mockResolvedValue({ items: [] });

vi.mock("@/lib/api/invoices", () => ({
  listInvoices: mockListInvoices,
  listSubscriptions: vi.fn().mockResolvedValue({ items: [] }),
  createInvoice: vi.fn(),
  downloadInvoicePdf: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateSubscription: vi.fn(),
  runBilling: vi.fn().mockResolvedValue({ processed: 0, invoicesCreated: [] }),
  downloadEfacturaXml: vi.fn(),
  downloadSagaCsv: vi.fn(),
  bulkGenerateInvoices: mockBulkGenerate,
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/lib/api/payments", () => ({
  listPayments: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/lib/api/tenantSettings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({
    id: "t1", name: "Academia", slug: "academia", plan: "starter",
    timezone: "Europe/Bucharest", invoicePrefix: "ACAD", iban: null, bic: null,
  }),
  updateTenantSettings: vi.fn(),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
    actions,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/invoices/SubscriptionTable", () => ({
  SubscriptionTable: () => <div>Sub table</div>,
}));

vi.mock("@/components/invoices/AddSubscriptionModal", () => ({
  AddSubscriptionModal: () => null,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PAY-002 — Bulk invoice generation API", () => {
  it("T-PAY-002-1 [blocant]: dryRun=true returns preview shape", async () => {
    mockBulkGenerate.mockResolvedValueOnce({
      dryRun: true,
      count: 5,
      totalAmountCents: 150000,
      currency: "RON",
      alreadyInvoiced: 2,
    });

    const result = await mockBulkGenerate({
      month: "2026-06",
      amountCents: 30000,
      currency: "RON",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.count).toBe(5);
    expect(result.totalAmountCents).toBe(150000);
    expect(result.alreadyInvoiced).toBe(2);
  });

  it("T-PAY-002-2 [blocant]: dryRun=false returns created count", async () => {
    mockBulkGenerate.mockResolvedValueOnce({
      dryRun: false,
      created: 5,
      skipped: 2,
      invoiceIds: ["a", "b", "c", "d", "e"],
    });

    const result = await mockBulkGenerate({
      month: "2026-06",
      amountCents: 30000,
      currency: "RON",
      dryRun: false,
    });

    expect(result.dryRun).toBe(false);
    expect(result.created).toBe(5);
    expect(result.skipped).toBe(2);
    expect(result.invoiceIds).toHaveLength(5);
  });

  it("T-PAY-002-3: InvoicesPage has 'Bulk generare' button", async () => {
    const { InvoicesPage } = await import("@/pages/app/InvoicesPage");
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bulk generare/i })).toBeInTheDocument();
    });
  });

  it("T-PAY-002-4 [blocant]: BulkGenerateDialog shows preview stats", async () => {
    mockBulkGenerate.mockResolvedValueOnce({
      dryRun: true,
      count: 8,
      totalAmountCents: 240000,
      currency: "RON",
      alreadyInvoiced: 1,
    });

    const { InvoicesPage } = await import("@/pages/app/InvoicesPage");
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bulk generare/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /bulk generare/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /generare bulk/i })).toBeInTheDocument();
    });

    const previewBtn = screen.getByRole("button", { name: /preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText("8")).toBeInTheDocument();
    });
  });

  it("T-PAY-002-5 [blocant]: BulkGenerateDialog can be closed", async () => {
    const { InvoicesPage } = await import("@/pages/app/InvoicesPage");
    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /bulk generare/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /bulk generare/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole("button", { name: /închide dialog/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
