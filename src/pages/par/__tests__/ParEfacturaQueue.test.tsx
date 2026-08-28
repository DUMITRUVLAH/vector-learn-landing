/**
 * PAR-EFP — /business/par/efactura, cele două taburi.
 * @vitest-environment jsdom
 *
 * Tab 1 („Cereri achitate") răspunde la „cererea mea are factură?"; tab 2 („Toate e-Facturile") la
 * „ce facturi am primit, în general?" — inclusiv cele care nu au niciun PAR în spate. Testele apasă
 * chiar tabul și verifică ce se încarcă, nu doar că butonul există.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ParEfacturaQueuePage from "../ParEfacturaQueue";
import * as api from "@/lib/api/parEfactura";
import type { ParEfacturaQueue, BuyerInvoiceList } from "@/lib/api/parEfactura";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/efactura", navigate: navigateMock }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: React.ReactNode; actions?: React.ReactNode }) => (
    <div data-testid="app-shell">
      {pageTitle ? <h1>{pageTitle}</h1> : null}
      {actions}
      {children}
    </div>
  ),
}));

const SFS_OK: ParEfacturaQueue["sfs"] = {
  configured: true,
  environment: "prod",
  idno: "1003600009999",
  hasCredentials: true,
  lastTestedAt: null,
};

function queue(): ParEfacturaQueue {
  return {
    items: [
      {
        parId: "11111111-1111-4111-8111-111111111111",
        requestNo: "PAR-2026-0025",
        payeeName: "VECTOR ACADEMY SRL",
        payeeIdnp: "1024600035737",
        vendorContactEmail: null,
        endUse: "proiect",
        currency: "MDL",
        amountCents: 1,
        paidAt: "2026-06-28T00:00:00.000Z",
        requestedBy: { id: "u1", name: "Solicitant", email: "solicitant@atic.md" },
        state: {
          status: "expected",
          supplierIdno: "1024600035737",
          sfsSeria: null,
          sfsNumber: null,
          sfsInvoiceStatus: null,
          sfsInvoiceStatusLabel: null,
          invoiceDate: null,
          invoiceTotalCents: null,
          lastScanAt: null,
          lastScanSource: null,
          lastScanMessage: null,
          reminderCount: 0,
          lastReminderAt: null,
          lastReminderToEmail: null,
          markedNote: null,
        },
      },
    ],
    counts: { missing: 1, found: 0, receivedManual: 0, notApplicable: 0 },
    filter: "missing",
    sfs: SFS_OK,
  };
}

function invoiceList(overrides: Partial<BuyerInvoiceList> = {}): BuyerInvoiceList {
  return {
    available: true,
    source: "sfs",
    message: "2 facturi primite găsite în SFS.",
    invoices: [
      {
        seria: "EFMD",
        number: "000000777",
        invoiceStatus: 3,
        invoiceStatusLabel: "Acceptat de Cumpărător",
        supplierIdno: "1009999999999",
        supplierName: "Orange Moldova",
        buyerIdno: "1003600009999",
        invoiceDate: "2026-08-20T00:00:00.000Z",
        totalCents: 30000,
        portalUrl: "https://efactura.sfs.md:443/EFactura.aspx?id=aaa",
        linkedParId: null,
        linkedRequestNo: null,
      },
      {
        seria: "EFMD",
        number: "000000123",
        invoiceStatus: 7,
        invoiceStatusLabel: "Trimis la Cumpărător",
        supplierIdno: "1024600035737",
        supplierName: "VECTOR ACADEMY SRL",
        buyerIdno: "1003600009999",
        invoiceDate: "2026-08-13T00:00:00.000Z",
        totalCents: 120000,
        portalUrl: null,
        linkedParId: "11111111-1111-4111-8111-111111111111",
        linkedRequestNo: "PAR-2026-0025",
      },
    ],
    sfs: SFS_OK,
    ...overrides,
  };
}

describe("ParEfacturaQueue — taburi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockClear();
  });

  it("pornește pe cererile achitate și nu cere SFS-ul până nu i se cere", async () => {
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(queue());
    const invoicesSpy = vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(invoiceList());

    render(<ParEfacturaQueuePage />);

    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());
    expect(invoicesSpy).not.toHaveBeenCalled();
  });

  it("tabul „Toate e-Facturile” arată și facturile fără cerere PAR", async () => {
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(queue());
    const invoicesSpy = vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(invoiceList());

    render(<ParEfacturaQueuePage />);
    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: /Toate e-Facturile/i }));

    await waitFor(() => expect(invoicesSpy).toHaveBeenCalled());
    expect(await screen.findByText("EFMD 000000777")).toBeInTheDocument();
    expect(screen.getByText("Orange Moldova")).toBeInTheDocument();
    // Factura fără PAR e marcată ca atare, nu ascunsă.
    expect(screen.getByText("fără cerere")).toBeInTheDocument();
    // Cea legată duce la cererea ei.
    expect(screen.getByRole("button", { name: "PAR-2026-0025" })).toBeInTheDocument();
    expect(screen.getByText("Trimis la Cumpărător")).toBeInTheDocument();
    // Factura cu link se deschide în portalul SFS.
    expect(screen.getByRole("link", { name: "EFMD 000000777" })).toHaveAttribute(
      "href",
      "https://efactura.sfs.md:443/EFactura.aspx?id=aaa"
    );
  });

  it("când SFS nu poate fi citit, tabul explică — nu arată o listă goală ca adevăr", async () => {
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(queue());
    vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(
      invoiceList({
        available: false,
        source: "mock",
        invoices: [],
        message: "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
      })
    );

    render(<ParEfacturaQueuePage />);
    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: /Toate e-Facturile/i }));

    expect(await screen.findByText(/Nu putem citi facturile din SFS/i)).toBeInTheDocument();
    expect(screen.getByText(/nu este configurată pentru această organizație/i)).toBeInTheDocument();
    expect(screen.queryByText("fără cerere")).not.toBeInTheDocument();
  });
});
