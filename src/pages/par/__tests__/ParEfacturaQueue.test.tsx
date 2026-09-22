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
  bankAccount: "MD70ML000000000222440923",
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

const SYNC_DONE: BuyerInvoiceList["sync"] = {
  total: 2,
  detailed: 2,
  pending: 0,
  archiveDone: true,
  historyYears: 5,
  archiveCursorTo: null,
  headsSyncedAt: "2026-09-22T09:00:00.000Z",
  lastBatchAt: "2026-09-22T09:00:00.000Z",
  lastMessage: "Sincronizare completă: 2 facturi în arhiva locală.",
  lastError: null,
  done: true,
};

function invoiceList(overrides: Partial<BuyerInvoiceList> = {}): BuyerInvoiceList {
  return {
    available: true,
    source: "sfs",
    needsSync: false,
    total: 2,
    totalCents: 150000,
    page: 1,
    pageSize: 50,
    suppliers: [
      { idno: "1009999999999", name: "Orange Moldova", count: 1, totalCents: 30000 },
      { idno: "1024600035737", name: "VECTOR ACADEMY SRL", count: 1, totalCents: 120000 },
    ],
    range: { oldest: "2026-08-13T00:00:00.000Z", newest: "2026-08-20T00:00:00.000Z" },
    sync: { ...SYNC_DONE },
    message: "2 facturi în arhiva locală.",
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
        detailsRead: true,
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
        detailsRead: true,
        portalUrl: null,
        linkedParId: "11111111-1111-4111-8111-111111111111",
        linkedRequestNo: "PAR-2026-0025",
      },
    ],
    sfs: SFS_OK,
    ...overrides,
  };
}

/** Un lot de sincronizare care nu mai are nimic de adus — implicit în toate testele. */
function syncDone(over: Partial<api.InvoiceSyncResult> = {}): api.InvoiceSyncResult {
  return {
    available: true,
    busy: false,
    discovered: 0,
    detailsRead: 0,
    message: "Sincronizare completă.",
    progress: { ...SYNC_DONE },
    ...over,
  };
}

describe("ParEfacturaQueue — taburi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockClear();
    // Niciun test nu are voie să iasă în rețea: sincronizarea e mereu simulată.
    vi.spyOn(api, "syncParEfacturaInvoices").mockResolvedValue(syncDone());
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
    // Seria/numărul deschid conținutul facturii ÎN APLICAȚIE (linkul din QR duce la 404 în portal).
    expect(screen.getByRole("button", { name: /Vezi factura EFMD 000000777/i })).toBeInTheDocument();
  });

  it("când SFS nu poate fi citit, tabul explică — nu arată o listă goală ca adevăr", async () => {
    const faraSfs = queue();
    faraSfs.sfs = { ...SFS_OK, configured: false, hasCredentials: false, environment: "mock" };
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(faraSfs);
    vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(
      invoiceList({
        available: false,
        source: "mock",
        needsSync: false,
        invoices: [],
        total: 0,
        totalCents: 0,
        suppliers: [],
        sync: { ...SYNC_DONE, total: 0, detailed: 0, done: false, lastBatchAt: null, headsSyncedAt: null },
        message: "Integrarea e-Factura (SFS) nu este configurată pentru această organizație.",
      })
    );

    render(<ParEfacturaQueuePage />);
    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: /Toate e-Facturile/i }));

    expect(await screen.findByText(/Nu putem spune ce facturi există/i)).toBeInTheDocument();
    // Motivul apare în două locuri (avertismentul de sus și starea goală a tabelului) — important
    // e că apare, nu de câte ori.
    expect(screen.getAllByText(/nu este configurată pentru această organizație/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("fără cerere")).not.toBeInTheDocument();
  });

  it("[blocant] citește în loturi: butonul chiar cheamă sincronizarea și arată progresul", async () => {
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(queue());
    // 543 de facturi știute, 200 cu detalii — exact situația din care a pornit schimbarea.
    vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(
      invoiceList({
        needsSync: true,
        sync: { ...SYNC_DONE, total: 543, detailed: 200, pending: 343, done: false },
      })
    );
    const syncSpy = vi
      .spyOn(api, "syncParEfacturaInvoices")
      .mockResolvedValue(syncDone({ detailsRead: 20, progress: { ...SYNC_DONE, total: 543, detailed: 220, pending: 323, done: false } }))
      .mockResolvedValueOnce(syncDone({ detailsRead: 20, progress: { ...SYNC_DONE, total: 543, detailed: 220, pending: 323, done: true } }));

    render(<ParEfacturaQueuePage />);
    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: /Toate e-Facturile/i }));

    expect(await screen.findByText(/343 facturi mai așteaptă citirea detaliilor/i)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Continuă citirea din SFS/i }));

    // Lotul chiar a plecat spre server (nu doar butonul există) și progresul s-a reîncărcat.
    await waitFor(() => expect(syncSpy).toHaveBeenCalled());
    // …iar lista s-a reîncărcat după lot: progresul se vede pe loc, nu la următoarea vizită.
    await waitFor(() => expect(vi.mocked(api.getParEfacturaInvoices).mock.calls.length).toBeGreaterThan(1));
  });

  it("[blocant] filtrul de perioadă și sortarea cer ALT răspuns de la server", async () => {
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValue(queue());
    const listSpy = vi.spyOn(api, "getParEfacturaInvoices").mockResolvedValue(invoiceList());

    render(<ParEfacturaQueuePage />);
    await waitFor(() => expect(screen.getByText("PAR-2026-0025")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: /Toate e-Facturile/i }));
    await waitFor(() => expect(listSpy).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Luna trecută" }));
    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
      )
    );

    await userEvent.selectOptions(screen.getByLabelText("Sortare"), "amount_desc");
    await waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ sort: "amount_desc" })));

    await userEvent.selectOptions(screen.getByLabelText("Furnizor"), "1009999999999");
    await waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ supplier: "1009999999999" })));
  });

  it("panoul de configurare preia setările venite de la server după montare", async () => {
    // Regresie: câmpurile se citeau O SINGURĂ DATĂ, la montare (`useState(sfs.idno ?? "")`). Dacă
    // primul răspuns nu aducea setările — sau dacă altcineva le schimba între timp — panoul rămânea
    // gol pentru totdeauna, fără nicio cale de reîncărcare. Iar cu „Cont bancar" gol butonul
    // Salvează e blocat: configurarea devenea imposibil de salvat fără să retastezi un IBAN care
    // exista deja pe server.
    const fara = queue();
    fara.sfs = { ...SFS_OK, idno: null, bankAccount: null };
    const cu = queue();
    vi.spyOn(api, "getParEfacturaQueue").mockResolvedValueOnce(fara).mockResolvedValue(cu);

    render(<ParEfacturaQueuePage />);
    await screen.findByText("PAR-2026-0025");

    // A doua încărcare (schimbarea filtrului) aduce setările reale.
    await userEvent.click(screen.getByRole("button", { name: "Toate" }));
    await waitFor(() => expect(api.getParEfacturaQueue).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: /Configurare SIA/i }));

    expect(screen.getByLabelText(/IDNO organizație/i)).toHaveValue("1003600009999");
    expect(screen.getByLabelText(/Cont bancar/i)).toHaveValue("MD70ML000000000222440923");
    expect(screen.getByRole("button", { name: /Salvează/i })).toBeEnabled();
  });
});
