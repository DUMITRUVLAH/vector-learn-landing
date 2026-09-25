/**
 * CRM-D04 — „Datele firmei tale": o dată, pe toate actele.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const perms = { value: ["documents.create", "pipelines.manage"] };
vi.mock("@/hooks/useCrmPermissions", () => ({
  useCrmPermissions: () => ({ can: (p: string) => perms.value.includes(p), permissions: perms.value, role: "admin", loading: false }),
}));
vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ pageTitle, children }: { pageTitle: string; children: React.ReactNode }) => (
    <main>
      <h1>{pageTitle}</h1>
      {children}
    </main>
  ),
}));

const getCrmCompanyProfile = vi.fn();
const saveCrmCompanyProfile = vi.fn();
vi.mock("@/lib/api/crmCompanyProfile", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/crmCompanyProfile")>()),
  getCrmCompanyProfile: () => getCrmCompanyProfile(),
  saveCrmCompanyProfile: (p: unknown) => saveCrmCompanyProfile(p),
}));

const { CrmCompanyProfilePage } = await import("@/pages/business/crm/CrmCompanyProfilePage");

const EMPTY = {
  legalName: "ATIC", idno: null, vatNumber: null, address: null, iban: null, bankName: null, bic: null,
  administratorName: null, administratorTitle: null, phone: null, email: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  perms.value = ["documents.create", "pipelines.manage"];
  getCrmCompanyProfile.mockResolvedValue({ profile: EMPTY, missing: ["IBAN", "Banca", "Administratorul"] });
});

describe("CRM-D04 — Datele firmei", () => {
  it("[blocant] spune pe nume ce iese gol pe acte", async () => {
    render(<CrmCompanyProfilePage />);
    expect(await screen.findByText(/IBAN, Banca, Administratorul/)).toBeInTheDocument();
  });

  it("[blocant] salvarea trimite câmpurile scrise și confirmă", async () => {
    saveCrmCompanyProfile.mockImplementation((p: typeof EMPTY) => Promise.resolve({ profile: p, missing: [] }));
    render(<CrmCompanyProfilePage />);
    await userEvent.type(await screen.findByLabelText(/^IBAN/), "MD24AG000225100013104168");
    await userEvent.type(screen.getByLabelText(/^Banca/), "BC Moldova-Agroindbank SA");
    await userEvent.click(screen.getByRole("button", { name: "Salvează" }));
    await waitFor(() => expect(saveCrmCompanyProfile).toHaveBeenCalled());
    expect(saveCrmCompanyProfile.mock.calls[0][0]).toMatchObject({ iban: "MD24AG000225100013104168", bankName: "BC Moldova-Agroindbank SA" });
    expect(await screen.findByText(/Actele noi le folosesc de acum/)).toBeInTheDocument();
    expect(screen.getByText(/Actele ies complete/)).toBeInTheDocument();
  });

  it("[blocant] un agent vede datele, dar nu le poate schimba", async () => {
    perms.value = ["documents.create"];
    render(<CrmCompanyProfilePage />);
    expect(await screen.findByLabelText(/^IBAN/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvează" })).not.toBeInTheDocument();
  });

  it("[normal] eroarea serverului apare în română, nu ca excepție", async () => {
    saveCrmCompanyProfile.mockRejectedValue(Object.assign(new Error("400"), { body: { message: "IBAN invalid (ex.: MD24…)" } }));
    render(<CrmCompanyProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Salvează" }));
    expect(await screen.findByText(/IBAN invalid/)).toBeInTheDocument();
  });
});
