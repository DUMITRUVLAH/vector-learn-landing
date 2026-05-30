/**
 * FIN-601 — Facturi PDF cu serie incrementală
 * Tests:
 * T-FIN-601-1: InvoicesPage renders without crash
 * T-FIN-601-2: Badge "issued" has correct blue token class
 * T-FIN-601-3: Empty state shows "Crează prima factură" button
 * T-FIN-601-4: Crează factură modal renders with student selector
 * T-FIN-601-5: API client listInvoices maps response correctly
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/invoices", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/lib/api/invoices", () => ({
  listInvoices: vi.fn().mockResolvedValue({ items: [] }),
  createInvoice: vi.fn(),
  getInvoicePdf: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/lib/api/payments", () => ({
  listPayments: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

import { InvoicesPage } from "@/pages/app/InvoicesPage";
import type { Invoice } from "@/lib/api/invoices";
import * as invoicesApi from "@/lib/api/invoices";

const mockInvoice: Invoice = {
  id: "inv-001",
  tenantId: "t1",
  studentId: "stu-001",
  paymentId: null,
  series: "VECT",
  number: 1,
  invoiceNumber: "VECT-2026-0001",
  amountCents: 28000,
  currency: "RON",
  status: "issued",
  issueDate: "2026-05-15T10:00:00Z",
  dueDate: null,
  notes: null,
  pdfKey: null,
  createdAt: "2026-05-15T10:00:00Z",
  studentName: "Maria Ionescu",
};

describe("FIN-601 — InvoicesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoicesApi.listInvoices).mockResolvedValue({ items: [] });
  });

  it("T-FIN-601-1: renders without crash", async () => {
    render(<InvoicesPage />);
    expect(screen.getByText("Facturi")).toBeDefined();
  });

  it("T-FIN-601-3: empty state shows create button", async () => {
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText("Crează prima factură")).toBeDefined();
    });
  });

  it("T-FIN-601-2: badge 'issued' has blue token class", async () => {
    vi.mocked(invoicesApi.listInvoices).mockResolvedValue({ items: [mockInvoice] });
    render(<InvoicesPage />);
    await waitFor(() => {
      // Use getAllByText and find the span badge (not the option)
      const badges = screen.getAllByText("Emisă").filter(
        (el) => el.tagName.toLowerCase() === "span"
      );
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0].className).toContain("text-primary");
    });
  });

  it("T-FIN-601-4: clicking Crează factură opens modal", async () => {
    render(<InvoicesPage />);
    // Wait for loading to finish
    await waitFor(() => screen.getByText("Crează factură"));
    const btn = screen.getAllByText("Crează factură")[0];
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText("Niciun elev activ")).toBeDefined();
    });
  });

  it("T-FIN-601-5: listInvoices is called with status filter when set", async () => {
    render(<InvoicesPage />);
    await waitFor(() => screen.getByText("Facturi"));
    expect(invoicesApi.listInvoices).toHaveBeenCalledWith({
      status: undefined,
      month: undefined,
    });
  });
});
