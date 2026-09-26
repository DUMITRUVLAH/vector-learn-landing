/**
 * CONTPLATA-faza-1 — editorul contului de plată, testat prin acțiune.
 *
 * Regresia care a pornit totul: previzualizarea era un iframe cu sursă `blob:`, blocată de CSP
 * („foaia tristă" din captura owner-ului). Acum iframe-ul arată ruta PDF de pe aceeași origine;
 * testul de mai jos pică dacă cineva reintroduce un blob.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ pageTitle, children, actions }: { pageTitle: string; children: React.ReactNode; actions?: React.ReactNode }) => (
    <main>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </main>
  ),
}));

const api = {
  getPaymentAccountSettings: vi.fn(),
  listPaymentAccountTemplates: vi.fn(),
  getPaymentAccount: vi.fn(),
  getNextPaymentAccountNumber: vi.fn(),
  createPaymentAccount: vi.fn(),
  updatePaymentAccount: vi.fn(),
  issuePaymentAccount: vi.fn(),
  getPaymentAccountCatalog: vi.fn(),
  searchRegistry: vi.fn(),
  getRegistryCompany: vi.fn(),
  startFromPaymentAccountTemplate: vi.fn(),
  getPaymentAccountPrefill: vi.fn(),
};
vi.mock("@/lib/api/paymentAccounts", async (orig) => {
  const real = await orig<typeof import("@/lib/api/paymentAccounts")>();
  return {
    ...real,
    getPaymentAccountSettings: () => api.getPaymentAccountSettings(),
    listPaymentAccountTemplates: () => api.listPaymentAccountTemplates(),
    getPaymentAccount: (id: string) => api.getPaymentAccount(id),
    getNextPaymentAccountNumber: (o: unknown) => api.getNextPaymentAccountNumber(o),
    createPaymentAccount: (i: unknown) => api.createPaymentAccount(i),
    updatePaymentAccount: (id: string, i: unknown) => api.updatePaymentAccount(id, i),
    issuePaymentAccount: (id: string, n?: string | null) => api.issuePaymentAccount(id, n),
    getPaymentAccountCatalog: (q: string) => api.getPaymentAccountCatalog(q),
    searchRegistry: (q: string) => api.searchRegistry(q),
    getRegistryCompany: (idno: string) => api.getRegistryCompany(idno),
    startFromPaymentAccountTemplate: (id: string, b?: unknown) => api.startFromPaymentAccountTemplate(id, b),
    getPaymentAccountPrefill: (f: unknown) => api.getPaymentAccountPrefill(f),
  };
});
vi.mock("@/lib/api/crmCompanies", () => ({ listCrmCompanies: () => Promise.resolve({ items: [] }) }));

const { CrmPaymentAccountEditorPage } = await import("@/pages/business/crm/CrmPaymentAccountEditorPage");
const { HashRouter } = await import("@/router/HashRouter");
// Routerul real (butoanele-link îl cer); pagina e montată direct, ca în App.tsx.
const Editor = () => (
  <HashRouter>
    <CrmPaymentAccountEditorPage />
  </HashRouter>
);

const SETTINGS = {
  settings: {
    series: "CP", numberPattern: "{serie}-{an}-{nr}", numberPad: 4, numberStart: 1, defaultVatRate: 0,
    defaultDueDays: 5, defaultLang: "ro", defaultNotes: "Indicați numărul contului.", layout: "modern",
    accentColor: "#047857", logoUrl: null, showLogo: true, showAmountWords: true, showSignature: true, showStamp: false, footerText: null,
  },
  issuer: { name: "Vector", idno: "1", vatCode: null, address: null, iban: "MD24", bankName: "MAIB", bic: null, phone: null, email: null, administrator: null, administratorTitle: null, orgLogoUrl: null },
  logoUrl: null,
  missing: [],
  nextNumber: "CP-2026-0007",
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "#/business/crm/conturi-plata/nou");
  api.getPaymentAccountSettings.mockResolvedValue({ data: SETTINGS });
  api.listPaymentAccountTemplates.mockResolvedValue({ data: [] });
  api.getNextPaymentAccountNumber.mockResolvedValue({ data: { series: "CP", number: 7, documentNumber: "CP-2026-0007" } });
  api.getPaymentAccountCatalog.mockResolvedValue({
    data: {
      products: [
        { id: "11111111-1111-1111-1111-111111111111", name: "Manual B1", sku: null, unit: "buc", listPriceCents: 35_000, currency: "MDL", vatPercent: 0, category: null, qtyOnHand: 3, tracksStock: true },
      ],
      recent: [{ description: "Consultanță", unit: "oră", unitPriceCents: 50_000, vatRate: 0, uses: 4, lastUsed: "2026-09-01" }],
    },
  });
  api.searchRegistry.mockResolvedValue({ data: [{ id: 1, idno: "1016600016713", name: "VECTOR-AP SRL", status: "activ", legalForm: null, registrationDate: null, liquidationDate: null, cuatmCode: null, address: "str. Ismail 33", city: "Chișinău" }] });
  api.getRegistryCompany.mockResolvedValue({ data: { contacts: { emails: ["contabil@vector-ap.md"], phones: ["+373 22 123 456"], websiteUrl: null, socialLinks: [] }, activities: { licensed: [], unlicensed: [] } } });
  api.createPaymentAccount.mockImplementation(() =>
    Promise.resolve({ data: { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", updatedAt: "2026-09-26T12:00:00.000Z" } })
  );
});

describe("CONTPLATA — editorul", () => {
  it("[blocant] numărul se arată automat, iar „Schimbă” permite scrierea lui de mână", async () => {
    render(<Editor />);
    expect(await screen.findByText("CP-2026-0007")).toBeInTheDocument();
    expect(screen.getByText("automat")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Schimbă/ }));
    const input = screen.getByLabelText("Număr") as HTMLInputElement;
    expect(input.value).toBe("CP-2026-0007");
    expect(screen.getByRole("button", { name: /Automat/ })).toBeInTheDocument();
  });

  it("[blocant] clientul din registru aduce și contactele (email, telefon)", async () => {
    render(<Editor />);
    await userEvent.type(await screen.findByLabelText(/Caută clientul/), "vector");
    await userEvent.click(await screen.findByRole("button", { name: /VECTOR-AP SRL/ }));
    await waitFor(() => expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("contabil@vector-ap.md"));
    expect((screen.getByLabelText(/Denumirea clientului/) as HTMLInputElement).value).toBe("VECTOR-AP SRL");
    expect((screen.getByLabelText(/IDNO/) as HTMLInputElement).value).toBe("1016600016713");
    expect((screen.getByLabelText("Telefon") as HTMLInputElement).value).toBe("+373 22 123 456");
  });

  it("[blocant] produsul din catalogul CRM completează prețul și avertizează la stoc insuficient", async () => {
    render(<Editor />);
    fireEvent.focus(await screen.findByLabelText(/Poziția 1/));
    await userEvent.click(await screen.findByRole("button", { name: /Manual B1/ }));
    expect((screen.getByLabelText(/Preț/) as HTMLInputElement).value).toBe("350");
    expect(screen.getByText("din catalogul CRM")).toBeInTheDocument();
    const qty = screen.getByLabelText("Cant.");
    await userEvent.clear(qty);
    await userEvent.type(qty, "5");
    expect(screen.getByText(/În stoc sunt doar 3/)).toBeInTheDocument();
  });

  it("[blocant] după salvarea automată, previzualizarea e ruta PDF de pe aceeași origine — nu un blob:", async () => {
    render(<Editor />);
    await userEvent.type(await screen.findByLabelText(/Denumirea clientului/), "Client SRL");
    await userEvent.type(screen.getByLabelText(/Poziția 1/), "Curs engleză");
    await userEvent.type(screen.getByLabelText(/Preț/), "4500");
    await waitFor(() => expect(api.createPaymentAccount).toHaveBeenCalled(), { timeout: 3000 });
    const sent = api.createPaymentAccount.mock.calls[0][0] as { buyerName: string; items: Array<{ unitPriceCents: number }> };
    expect(sent.buyerName).toBe("Client SRL");
    expect(sent.items[0].unitPriceCents).toBe(450_000);
    const frame = await screen.findByTitle("Previzualizarea contului de plată");
    const src = frame.getAttribute("src") ?? "";
    expect(src.startsWith("/api/payment-accounts/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/pdf")).toBe(true);
    expect(src).not.toMatch(/^blob:/);
    // Adresa devine cea a contului salvat, ca un refresh să nu piardă ciorna.
    expect(window.location.hash).toBe("#/business/crm/conturi-plata/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("[blocant] o creare lentă + tastare în continuare = O SINGURĂ ciornă, apoi actualizări", async () => {
    let release: () => void = () => {};
    api.createPaymentAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", updatedAt: "2026-09-26T12:00:00.000Z" } });
        })
    );
    api.updatePaymentAccount.mockResolvedValue({ data: { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", updatedAt: "2026-09-26T12:00:05.000Z" } });
    render(<Editor />);
    await userEvent.type(await screen.findByLabelText(/Denumirea clientului/), "Client SRL");
    await userEvent.type(screen.getByLabelText(/Poziția 1/), "Curs");
    await waitFor(() => expect(api.createPaymentAccount).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // Crearea încă atârnă; omul scrie mai departe și pauza de salvare expiră din nou.
    await userEvent.type(screen.getByLabelText(/Preț/), "100");
    await new Promise((r) => setTimeout(r, 1200));
    release();
    await waitFor(() => expect(api.updatePaymentAccount).toHaveBeenCalled(), { timeout: 3000 });
    expect(api.createPaymentAccount).toHaveBeenCalledTimes(1);
    expect(api.updatePaymentAccount.mock.calls[0][0]).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });

  it("[blocant] pornit de pe fișa leadului: clientul și produsul sunt deja puse, iar ciorna poartă leadul", async () => {
    window.history.replaceState(null, "", "#/business/crm/conturi-plata/nou?lead=cccccccc-cccc-cccc-cccc-cccccccccccc");
    api.getPaymentAccountPrefill.mockResolvedValue({
      data: {
        leadId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        buyer: { buyerName: "Firma Leadului SRL", buyerIdno: "1002003004005", buyerEmail: "office@firma.md", crmCompanyId: "dddddddd-dddd-dddd-dddd-dddddddddddd" },
        items: [{ description: "Pachet corporate", unit: "pachet", quantity: 3, unitPriceCents: 900_000, vatRate: 20, productId: "11111111-1111-1111-1111-111111111111" }],
      },
    });
    render(<Editor />);
    await waitFor(() => expect((screen.getByLabelText(/Denumirea clientului/) as HTMLInputElement).value).toBe("Firma Leadului SRL"));
    expect((screen.getByLabelText(/Poziția 1/) as HTMLInputElement).value).toBe("Pachet corporate");
    expect((screen.getByLabelText("Cant.") as HTMLInputElement).value).toBe("3");
    expect(api.getPaymentAccountPrefill).toHaveBeenCalledWith({ leadId: "cccccccc-cccc-cccc-cccc-cccccccccccc", companyId: null });
    await waitFor(() => expect(api.createPaymentAccount).toHaveBeenCalled(), { timeout: 3000 });
    expect(api.createPaymentAccount.mock.calls[0][0]).toMatchObject({ leadId: "cccccccc-cccc-cccc-cccc-cccccccccccc", crmCompanyId: "dddddddd-dddd-dddd-dddd-dddddddddddd" });
  });

  it("[normal] „folosite anterior” completează serviciul dintr-un cont vechi", async () => {
    render(<Editor />);
    fireEvent.focus(await screen.findByLabelText(/Poziția 1/));
    await userEvent.click(await screen.findByRole("button", { name: /Consultanță/ }));
    expect((screen.getByLabelText(/Poziția 1/) as HTMLInputElement).value).toBe("Consultanță");
    expect((screen.getByLabelText(/Preț/) as HTMLInputElement).value).toBe("500");
    expect((screen.getByLabelText("U.M.") as HTMLInputElement).value).toBe("oră");
  });
});
