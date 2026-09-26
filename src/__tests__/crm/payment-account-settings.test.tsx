/**
 * CONTPLATA-faza-1 — setările contului de plată (aspect, logo, numerotare) și lista.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  savePaymentAccountSettings: vi.fn(),
  listPaymentAccounts: vi.fn(),
};
vi.mock("@/lib/api/paymentAccounts", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/paymentAccounts")>()),
  getPaymentAccountSettings: () => api.getPaymentAccountSettings(),
  savePaymentAccountSettings: (i: unknown) => api.savePaymentAccountSettings(i),
  listPaymentAccounts: (s?: string, q?: string) => api.listPaymentAccounts(s, q),
}));
const getCrmCompanyProfile = vi.fn();
const saveCrmCompanyProfile = vi.fn();
vi.mock("@/lib/api/crmCompanyProfile", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/crmCompanyProfile")>()),
  getCrmCompanyProfile: () => getCrmCompanyProfile(),
  saveCrmCompanyProfile: (p: unknown) => saveCrmCompanyProfile(p),
}));

const { CrmPaymentAccountSettingsPage } = await import("@/pages/business/crm/CrmPaymentAccountSettingsPage");
const { CrmPaymentAccountsPage } = await import("@/pages/business/crm/CrmPaymentAccountsPage");
const { HashRouter } = await import("@/router/HashRouter");

const SETTINGS = {
  series: "CP", numberPattern: "{serie}-{an}-{nr}", numberPad: 4, numberStart: 1, defaultVatRate: 0,
  defaultDueDays: 5, defaultLang: "ro", defaultNotes: null, layout: "modern", accentColor: "#047857",
  logoUrl: null, showLogo: true, showAmountWords: true, showSignature: true, showStamp: false, footerText: null,
};
const VIEW = {
  settings: SETTINGS,
  issuer: { name: "Vector", idno: null, vatCode: null, address: null, iban: null, bankName: null, bic: null, phone: null, email: null, administrator: null, administratorTitle: null, orgLogoUrl: null },
  logoUrl: null,
  missing: ["IDNO", "IBAN", "Banca"],
  nextNumber: "CP-2026-0001",
};
const PROFILE = {
  legalName: "Vector", idno: null, vatNumber: null, address: null, iban: null, bankName: null, bic: null,
  administratorName: null, administratorTitle: null, phone: null, email: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getPaymentAccountSettings.mockResolvedValue({ data: VIEW });
  api.savePaymentAccountSettings.mockImplementation((i: Record<string, unknown>) =>
    Promise.resolve({ data: { ...VIEW, settings: { ...SETTINGS, ...i } } })
  );
  getCrmCompanyProfile.mockResolvedValue({ profile: PROFILE, missing: [] });
  saveCrmCompanyProfile.mockImplementation((p: unknown) => Promise.resolve({ profile: p, missing: [] }));
});

describe("CONTPLATA — setările", () => {
  it("[blocant] mostra e un PDF de pe aceeași origine, iar lipsurile din rechizite sunt spuse pe nume", async () => {
    render(<HashRouter><CrmPaymentAccountSettingsPage /></HashRouter>);
    expect(await screen.findByText(/Lipsesc: IDNO, IBAN, Banca/)).toBeInTheDocument();
    const frame = screen.getByTitle("Mostra contului de plată");
    expect(frame.getAttribute("src")).toMatch(/^\/api\/payment-accounts\/settings\/sample\.pdf\?v=/);
  });

  it("[blocant] alegi macheta + culoarea, salvezi, și rechizitele pleacă în „Datele firmei”", async () => {
    render(<HashRouter><CrmPaymentAccountSettingsPage /></HashRouter>);
    await userEvent.click(await screen.findByText("Clasic"));
    await userEvent.click(screen.getByRole("button", { name: "Culoarea Bleumarin" }));
    await userEvent.type(screen.getByLabelText("IBAN"), "MD24AG000225100013104168");
    const frameBefore = screen.getByTitle("Mostra contului de plată").getAttribute("src");
    await userEvent.click(screen.getByRole("button", { name: /Salvează și actualizează mostra/ }));
    await waitFor(() => expect(api.savePaymentAccountSettings).toHaveBeenCalled());
    expect(api.savePaymentAccountSettings.mock.calls[0][0]).toMatchObject({ layout: "clasic", accentColor: "#1F3A68" });
    expect(saveCrmCompanyProfile.mock.calls[0][0]).toMatchObject({ iban: "MD24AG000225100013104168" });
    // Mostra se reîncarcă după salvare — altfel omul ar vedea aspectul vechi.
    await waitFor(() => expect(screen.getByTitle("Mostra contului de plată").getAttribute("src")).not.toBe(frameBefore));
  });

  it("[blocant] formatul fără {nr} blochează salvarea (ar da același număr la toate conturile)", async () => {
    render(<HashRouter><CrmPaymentAccountSettingsPage /></HashRouter>);
    const pattern = await screen.findByLabelText("Formatul");
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "CP-{{an}");
    expect(screen.getByRole("button", { name: /Salvează și actualizează mostra/ })).toBeDisabled();
  });

  it("[normal] exemplul de număr urmează seria și numărul de start", async () => {
    render(<HashRouter><CrmPaymentAccountSettingsPage /></HashRouter>);
    const series = await screen.findByLabelText("Seria");
    await userEvent.clear(series);
    await userEvent.type(series, "VA");
    const start = screen.getByLabelText("Începe de la numărul");
    await userEvent.clear(start);
    await userEvent.type(start, "279");
    expect(screen.getByText(`VA-${new Date().getFullYear()}-0279`)).toBeInTheDocument();
  });
});

describe("CONTPLATA — lista", () => {
  it("[blocant] arată totalul de încasat și linkul spre fiecare cont", async () => {
    api.listPaymentAccounts.mockResolvedValue({
      data: [
        { id: "a1", documentNumber: "CP-2026-0001", buyerName: "Client A", buyerIdno: null, status: "issued", currency: "MDL", totalCents: 120_000, issueDate: "2026-09-01", dueDate: "2026-09-05" },
        { id: "a2", documentNumber: null, buyerName: "Client B", buyerIdno: null, status: "draft", currency: "MDL", totalCents: 5_000, issueDate: "2026-09-02", dueDate: null },
      ],
    });
    render(<HashRouter><CrmPaymentAccountsPage /></HashRouter>);
    expect(await screen.findByText("1 200,00 MDL", { selector: "p, span, div, dd" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CP-2026-0001" })).toHaveAttribute("href", "#/business/crm/conturi-plata/a1");
    expect(screen.getByText("Cu termenul depășit")).toBeInTheDocument();
    expect(screen.getByText("ciornă")).toBeInTheDocument();
  });

  it("[normal] fără conturi, îndeamnă la primul", async () => {
    api.listPaymentAccounts.mockResolvedValue({ data: [] });
    render(<HashRouter><CrmPaymentAccountsPage /></HashRouter>);
    expect(await screen.findByText("Niciun cont de plată încă")).toBeInTheDocument();
  });
});
