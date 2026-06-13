/**
 * FIN-604 — e-Factura export stub + SAGA CSV
 * Tests:
 * T-FIN-604-1: generateUBL21 returns string containing <Invoice> tag
 * T-FIN-604-2: generateUBL21 output contains <ID> with invoiceNumber
 * T-FIN-604-3: generateUBL21 output contains <InvoiceLine>
 * T-FIN-604-4: generateUBL21 output contains <IssueDate>
 * T-FIN-604-5: generateUBL21 output is parsable as XML (DOMParser equivalent check)
 * T-FIN-604-6: generateUBL21 escapes special XML chars in studentName
 * T-FIN-604-7: e-Factura button visible for issued/paid invoices (UI test)
 * T-FIN-604-8: Export SAGA CSV button renders in filter bar (UI test)
 */
import { describe, it, expect, vi } from "vitest";
import { generateUBL21 } from "../../../server/lib/efactura";

// ─── UBL generator unit tests ─────────────────────────────────────────────────

const baseInvoice = {
  invoiceNumber: "VECT-2026-0001",
  issueDate: new Date("2026-05-15"),
  amountCents: 28000,
  currency: "RON",
  studentName: "Ion Popescu",
  notes: "Curs engleza B1",
};

describe("FIN-604 — generateUBL21", () => {
  it("T-FIN-604-1: returns string containing <Invoice> tag", () => {
    const xml = generateUBL21(baseInvoice);
    expect(typeof xml).toBe("string");
    expect(xml).toContain("<Invoice ");
  });

  it("T-FIN-604-2: contains <ID> with invoiceNumber", () => {
    const xml = generateUBL21(baseInvoice);
    expect(xml).toContain("<cbc:ID>VECT-2026-0001</cbc:ID>");
  });

  it("T-FIN-604-3: contains <InvoiceLine>", () => {
    const xml = generateUBL21(baseInvoice);
    expect(xml).toContain("<cac:InvoiceLine>");
  });

  it("T-FIN-604-4: contains <IssueDate> with correct date", () => {
    const xml = generateUBL21(baseInvoice);
    expect(xml).toContain("<cbc:IssueDate>2026-05-15</cbc:IssueDate>");
  });

  it("T-FIN-604-5: XML starts with standard declaration and has balanced root", () => {
    const xml = generateUBL21(baseInvoice);
    expect(xml.startsWith("<?xml version")).toBe(true);
    // Count opening and closing Invoice tags
    const opens = (xml.match(/<Invoice /g) ?? []).length;
    const closes = (xml.match(/<\/Invoice>/g) ?? []).length;
    expect(opens).toBe(1);
    expect(closes).toBe(1);
  });

  it("T-FIN-604-6: escapes special XML chars in student name", () => {
    const xml = generateUBL21({ ...baseInvoice, studentName: "Ion & Maria <Test>" });
    expect(xml).toContain("Ion &amp; Maria &lt;Test&gt;");
    expect(xml).not.toContain("<Test>");
  });

  it("T-FIN-604-6b: uses default supplier info when not provided", () => {
    const xml = generateUBL21(baseInvoice);
    expect(xml).toContain("VECT SRL");
    expect(xml).toContain("RO12345678");
  });

  it("T-FIN-604-6c: uses custom supplier when provided", () => {
    const xml = generateUBL21({
      ...baseInvoice,
      supplierCui: "RO99999999",
      supplierName: "Academia Mea SRL",
    });
    expect(xml).toContain("Academia Mea SRL");
    expect(xml).toContain("RO99999999");
  });
});

// ─── UI tests (InvoicesPage with e-Factura button) ────────────────────────────

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { InvoicesPage } from "@/pages/app/InvoicesPage";
import * as invoicesApi from "@/lib/api/invoices";

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/invoices", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));
vi.mock("@/lib/api/invoices", () => ({
  listInvoices: vi.fn().mockResolvedValue({ items: [] }),
  listSubscriptions: vi.fn().mockResolvedValue({ items: [] }),
  createInvoice: vi.fn(),
  getInvoicePdf: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateSubscription: vi.fn(),
  runBilling: vi.fn().mockResolvedValue({ processed: 0, invoicesCreated: [] }),
  downloadEfacturaXml: vi.fn(),
  downloadSagaCsv: vi.fn(),
}));
vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("@/lib/api/payments", () => ({
  listPayments: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, actions }: { children: React.ReactNode; pageTitle: string; actions?: React.ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

const issuedInvoice = {
  id: "inv-001",
  tenantId: "t1",
  studentId: "stu-001",
  paymentId: null,
  series: "VECT",
  number: 1,
  invoiceNumber: "VECT-2026-0001",
  amountCents: 28000,
  currency: "RON" as const,
  status: "issued" as const,
  issueDate: "2026-05-15T10:00:00Z",
  dueDate: null,
  notes: null,
  pdfKey: null,
  efacturaMdSeria: null,
  efacturaMdNumber: null,
  efacturaMdStatus: null,
  createdAt: "2026-05-15T10:00:00Z",
  studentName: "Maria Ionescu",
};

describe("FIN-604 — InvoicesPage UI", () => {
  it("T-FIN-604-7: e-Factura XML button visible for issued invoice", async () => {
    vi.mocked(invoicesApi.listInvoices).mockResolvedValue({ items: [issuedInvoice] });
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Descarcă e-Factura XML VECT-2026-0001")).toBeDefined();
    });
  });

  it("T-FIN-604-7b: clicking e-Factura button calls downloadEfacturaXml", async () => {
    vi.mocked(invoicesApi.listInvoices).mockResolvedValue({ items: [issuedInvoice] });
    render(<InvoicesPage />);
    await waitFor(() => screen.getByLabelText("Descarcă e-Factura XML VECT-2026-0001"));
    fireEvent.click(screen.getByLabelText("Descarcă e-Factura XML VECT-2026-0001"));
    expect(invoicesApi.downloadEfacturaXml).toHaveBeenCalledWith("inv-001");
  });

  it("T-FIN-604-8: Export SAGA CSV button renders in filter bar", async () => {
    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByText("Export SAGA CSV")).toBeDefined();
    });
  });

  it("T-FIN-604-8b: clicking Export SAGA CSV calls downloadSagaCsv", async () => {
    render(<InvoicesPage />);
    await waitFor(() => screen.getByText("Export SAGA CSV"));
    fireEvent.click(screen.getByText("Export SAGA CSV"));
    expect(invoicesApi.downloadSagaCsv).toHaveBeenCalled();
  });
});
