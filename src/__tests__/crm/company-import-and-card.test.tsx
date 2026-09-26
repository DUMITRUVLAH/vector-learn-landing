/**
 * Clienți & firme — importul de firme din Excel/CSV și fișa clientului.
 *
 * Testăm ACȚIUNEA, nu doar butonul (CLAUDE.md §3.5.1quater): importul trebuie să ajungă la
 * `runCrmCompanyImport` cu maparea aleasă de om, iar fișa trebuie să arate istoricul primit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { companyHref, companyIdFromPath } from "@/lib/crm/companyUrl";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Andreea Admin", role: "owner" },
      tenant: { name: "Test", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: [], loading: false, error: null }),
}));

const navigate = vi.fn();
let routePath = "/business/crm/clienti";
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: routePath, navigate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const listCrmCompanies = vi.fn();
const listCrmDuplicates = vi.fn();
const previewCrmCompanyImport = vi.fn();
const runCrmCompanyImport = vi.fn();
const getCrmCompanyOverview = vi.fn();

vi.mock("@/lib/api/crmCompanies", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmCompanies")>("@/lib/api/crmCompanies");
  return {
    ...actual,
    listCrmCompanies: (...a: unknown[]) => listCrmCompanies(...a),
    listCrmDuplicates: (...a: unknown[]) => listCrmDuplicates(...a),
    previewCrmCompanyImport: (...a: unknown[]) => previewCrmCompanyImport(...a),
    runCrmCompanyImport: (...a: unknown[]) => runCrmCompanyImport(...a),
    getCrmCompanyOverview: (...a: unknown[]) => getCrmCompanyOverview(...a),
  };
});

const { CrmCompaniesPage } = await import("@/pages/business/crm/CrmCompaniesPage");
const { CrmCompanyDetailPage } = await import("@/pages/business/crm/CrmCompanyDetailPage");

const COMPANY = {
  id: "co-1",
  name: "Alfa Agro SA",
  idno: "9100600340517",
  industry: "Agricultură",
  region: "Nord",
  companySize: null,
  annualConsumptionKwh: null,
  website: null,
  phone: "+373 54 34 95 76",
  email: null,
  address: null,
  notes: "Administrator: Ion Rusu",
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
  leadCount: 2,
};

const PREVIEW = {
  headers: ["Denumirea", "Cod fiscal", "Administrator"],
  delimiter: ";",
  sheetNames: [],
  topRows: [
    ["Lista clienti", "", ""],
    ["Denumirea", "Cod fiscal", "Administrator"],
  ],
  sampleRows: [["Alfa SRL", "1003600012345", "Ion Rusu"]],
  mapping: { 0: "name", 1: "idno", 2: "ignore" },
  counts: { total: 2, new: 1, exists: 1, duplicatesInFile: 0, errors: 0 },
  rows: [
    { draft: { rowNumber: 3, name: "Alfa SRL", idno: "1003600012345", phone: null, email: null, industry: null, region: null, notes: null }, status: "new", errors: [], warnings: [], existingId: null },
    { draft: { rowNumber: 4, name: "Beta SRL", idno: null, phone: null, email: null, industry: null, region: null, notes: null }, status: "exists", errors: [], warnings: [], existingId: "co-9" },
  ],
  truncated: false,
};

describe("companyUrl", () => {
  it("[blocant] id-ul se citește și cu query, și dus-întors prin href", () => {
    expect(companyIdFromPath(companyHref("abc-1"))).toBe("abc-1");
    expect(companyIdFromPath("/business/crm/clienti/abc-1?x=1")).toBe("abc-1");
    expect(companyIdFromPath("/business/crm/clienti")).toBeNull();
  });
});

describe("Lista de clienți", () => {
  beforeEach(() => {
    routePath = "/business/crm/clienti";
    listCrmCompanies.mockResolvedValue({ items: [COMPANY] });
    listCrmDuplicates.mockResolvedValue({ clusters: [] });
  });

  it("[blocant] fiecare firmă se deschide în fișa ei", async () => {
    render(<CrmCompaniesPage />);
    const link = await screen.findByRole("link", { name: "Alfa Agro SA" });
    expect(link.getAttribute("href")).toBe("#/business/crm/clienti/co-1");
    fireEvent.click(screen.getByText("Nord"));
    expect(navigate).toHaveBeenCalledWith("/business/crm/clienti/co-1");
  });

  it("[blocant] importul trece prin coloane și verificare, apoi scrie cu maparea aleasă", async () => {
    previewCrmCompanyImport.mockResolvedValue(PREVIEW);
    runCrmCompanyImport.mockResolvedValue({ created: 1, updated: 1, unchanged: 0, skipped: 0, details: [] });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /importă din excel/i }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText(/lipește tabelul/i), {
      target: { value: "Lista clienti;;\nDenumirea;Cod fiscal;Administrator\nAlfa SRL;1003600012345;Ion Rusu" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /citește fișierul/i }));

    // Pasul 2: exemplele din fișier stau lângă coloană; Administrator se trimite în Notițe.
    const select = await within(dialog).findByLabelText(/ce este coloana administrator/i);
    expect(within(dialog).getByText("Ion Rusu")).toBeTruthy();
    fireEvent.change(select, { target: { value: "notes" } });
    await waitFor(() =>
      expect(previewCrmCompanyImport).toHaveBeenLastCalledWith(
        expect.objectContaining({ mapping: { 0: "name", 1: "idno", 2: "notes" } })
      )
    );

    // Rândul antetului se poate alege — alt antet = mapare propusă din nou.
    fireEvent.change(within(dialog).getByLabelText(/rândul cu numele coloanelor/i), { target: { value: "2" } });
    await waitFor(() =>
      expect(previewCrmCompanyImport).toHaveBeenLastCalledWith(expect.objectContaining({ headerRow: 2, mapping: null }))
    );

    fireEvent.click(within(dialog).getByRole("button", { name: /mai departe/i }));
    // Nimic scris până la ultimul buton.
    expect(runCrmCompanyImport).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByLabelText(/sari peste ele/i));
    fireEvent.click(await within(dialog).findByRole("button", { name: /^importă 1 firmă$/i }));

    await waitFor(() =>
      expect(runCrmCompanyImport).toHaveBeenCalledWith(
        expect.objectContaining({ headerRow: 2, existingMode: "skip", format: "text" })
      )
    );
    expect(await within(dialog).findByText(/import terminat/i)).toBeTruthy();
    // Lista se reîncarcă după import.
    await waitFor(() => expect(listCrmCompanies.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("fără coloana de denumire, importul nu poate continua", async () => {
    previewCrmCompanyImport.mockResolvedValue({ ...PREVIEW, mapping: { 0: "ignore", 1: "idno", 2: "ignore" } });
    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /importă din excel/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/lipește tabelul/i), { target: { value: "a;b\n1;2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /citește fișierul/i }));
    expect(await within(dialog).findByText(/alege coloana cu denumirea/i)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: /mai departe/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Fișa clientului", () => {
  beforeEach(() => {
    routePath = "/business/crm/clienti/co-1";
  });

  it("[blocant] arată datele, oportunitățile, contactele și istoricul firmei", async () => {
    getCrmCompanyOverview.mockResolvedValue({
      company: COMPANY,
      stats: { deals: 1, openDeals: 1, openValueCents: 1500000, wonValueCents: 0, lastActivityAt: "2026-09-20T10:00:00Z" },
      deals: [
        {
          id: "lead-1",
          fullName: "Ion Rusu",
          dealName: "Contract energie 2027",
          stage: "offer",
          stageLabel: "Ofertă trimisă",
          outcome: "open",
          pipelineName: "Vânzări B2B",
          valueCents: 1500000,
          ownerName: "Andreea",
          updatedAt: "2026-09-20T10:00:00Z",
        },
      ],
      contacts: [{ id: "c-1", leadId: "lead-1", fullName: "Maria Contabil", role: "Contabil", phone: "069000111", email: null, isPrimary: true, leadName: null }],
      tasks: [{ id: "t-1", leadId: "lead-1", title: "Sună pentru semnare", dueAt: null, leadName: "Contract energie 2027" }],
      documents: [],
      activity: [
        { id: "a-1", leadId: "lead-1", type: "call", direction: "outbound", body: "A cerut oferta pe 2027", occurredAt: "2026-09-20T10:00:00Z", userName: "Andreea", leadName: "Contract energie 2027" },
      ],
    });

    render(<CrmCompanyDetailPage />);
    expect(getCrmCompanyOverview).toHaveBeenCalledWith("co-1");
    expect(await screen.findByText("A cerut oferta pe 2027")).toBeTruthy();
    expect(screen.getByText("9100600340517")).toBeTruthy();
    expect(screen.getByText("Ofertă trimisă")).toBeTruthy();
    expect(screen.getByText("Maria Contabil")).toBeTruthy();
    expect(screen.getByText("Sună pentru semnare")).toBeTruthy();
    expect(screen.getByText("Administrator: Ion Rusu")).toBeTruthy();
    // Oportunitatea apare în tabel și în istoric; ambele linkuri deschid leadul în pâlnie.
    const deals = screen.getAllByRole("link", { name: "Contract energie 2027" });
    expect(deals.length).toBeGreaterThanOrEqual(2);
    for (const d of deals) expect(d.getAttribute("href")).toBe("#/business/crm/pipeline?lead=lead-1");
  });

  it("o firmă care nu există spune asta, nu arată o pagină goală", async () => {
    getCrmCompanyOverview.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
    render(<CrmCompanyDetailPage />);
    expect(await screen.findByText(/nu există sau nu e în acest workspace/i)).toBeTruthy();
  });
});
