/**
 * Registrul „Furnizori / Plătitori" — fiecare rechizit are coloana lui.
 *
 * Raportat de contabilă (2026-08-25) peste captura din admin: „aici tre sa fie colonita separata
 * pt cod idno si cod tva, cod bancar — tot e intro linie la tine". Tabelul avea trei coloane
 * (Nume / IBAN / Bancă), iar „Bancă" ținea și codul bancar, și codul fiscal, și TVA-ul.
 *
 * Testele verifică ACȚIUNEA, nu doar randarea (CLAUDE.md §3.5.1quater): coloanele afișează
 * valorile din câmpurile lor, iar butonul de reparare chiar cheamă endpoint-ul și reîncarcă lista.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ParAdmin } from "../ParAdmin";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/admin", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

// Mock PARȚIAL: pagina „Date referință" cheamă zeci de funcții din modul, iar o fabrică
// completă s-ar dezechilibra la fiecare export nou. Suprascriem doar ce ne interesează.
vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  // Fixtura stă în interiorul fabricii: vi.mock e ridicat deasupra oricărei variabile de modul.
  const vendor = {
    id: "v-1",
    name: "NEWS MAKER SRL",
    idnp: "1014600022332",
    vatCode: "0301234",
    iban: "MD03AG000000022512323419",
    bicSwift: "AGRNMD2X885",
    bank: "BC'MAIB'S.A. sucursala Stefan cel Mare",
    active: true,
  };
  return {
  ...actual,
  listParDoaMatrix: vi.fn().mockResolvedValue({ rows: [] }),
  createParDoaRow: vi.fn().mockResolvedValue({}),
  updateParDoaRow: vi.fn().mockResolvedValue({}),
  deleteParDoaRow: vi.fn().mockResolvedValue({ ok: true }),
  getParSettings: vi.fn().mockResolvedValue({
    microPurchaseThresholdCents: 1000000,
    defaultCurrency: "MDL",
    orgLegalName: null,
    orgLogoUrl: null,
    pdfHelpUrl: null,
    requestNoPrefix: "PAR",
  }),
  updateParSettings: vi.fn().mockResolvedValue({}),
  listPayers: vi.fn().mockResolvedValue({ items: [] }),
  listParMembers: vi.fn().mockResolvedValue({ members: [] }),
  listParMemberCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
  assignParMember: vi.fn().mockResolvedValue({}),
  revokeParMember: vi.fn().mockResolvedValue({ ok: true }),
  listDepartments: vi.fn().mockResolvedValue({ items: [] }),
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  listBudgetCodes: vi.fn().mockResolvedValue({ items: [] }),
  // load() le cere pe toate într-un Promise.all — una nemockuită respinge tot și lista rămâne goală.
  listEvents: vi.fn().mockResolvedValue({ events: [] }),
  listVendors: vi.fn().mockResolvedValue({ items: [vendor] }),
  createDepartment: vi.fn().mockResolvedValue({}),
  updateDepartment: vi.fn().mockResolvedValue({}),
  deleteDepartment: vi.fn().mockResolvedValue({ ok: true }),
  createProject: vi.fn().mockResolvedValue({}),
  updateProject: vi.fn().mockResolvedValue({}),
  deleteProject: vi.fn().mockResolvedValue({ ok: true }),
  createBudgetCode: vi.fn().mockResolvedValue({}),
  updateBudgetCode: vi.fn().mockResolvedValue({}),
  deleteBudgetCode: vi.fn().mockResolvedValue({ ok: true }),
  createVendor: vi.fn().mockResolvedValue({}),
  updateVendor: vi.fn().mockResolvedValue({}),
  deleteVendor: vi.fn().mockResolvedValue({ ok: true }),
  normalizeVendorRequisites: vi.fn().mockResolvedValue({ ok: true, scanned: 3, updated: 1 }),
  searchRegistryCompanies: vi.fn().mockResolvedValue([]),
  formatMDL: (cents: number) => `${(cents / 100).toLocaleString()} MDL`,
  };
});

/** Deschide fila „Date referință" → secțiunea „Beneficiari / Furnizori". */
async function openVendors() {
  render(<ParAdmin isAdmin />);
  fireEvent.click(await screen.findByRole("tab", { name: /Date referință/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /Furnizori/i }));
  return screen.findByRole("table", { name: "Furnizori" });
}

describe("VendorSection — rechizitele au coloane separate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("arată cod fiscal, cod TVA, IBAN și cod bancar ca antete proprii", async () => {
    const table = await openVendors();
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim());
    expect(headers).toEqual(
      expect.arrayContaining(["Cod fiscal / IDNO", "Cod TVA", "IBAN", "Cod bancar", "Bancă"])
    );
  });

  it("pune fiecare cod în celula lui, nu îngrămădite în „Bancă”", async () => {
    const table = await openVendors();
    const row = (await within(table).findByText("NEWS MAKER SRL")).closest("tr")!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent?.trim());

    expect(cells).toEqual(
      expect.arrayContaining([
        "1014600022332",
        "0301234",
        "MD03AG000000022512323419",
        "AGRNMD2X885",
        "BC'MAIB'S.A. sucursala Stefan cel Mare",
      ])
    );
    // Regresia propriu-zisă: celula „Bancă" nu mai conține codurile.
    const bankCell = cells.find((c) => c?.startsWith("BC'MAIB'"));
    expect(bankCell).not.toContain("AGRNMD2X885");
    expect(bankCell).not.toContain("1014600022332");
  });

  it("formularul are câmp separat pentru codul de TVA și pentru codul bancar", async () => {
    await openVendors();
    fireEvent.click(screen.getByLabelText("Adaugă furnizor"));
    await waitFor(() => {
      expect(screen.getByLabelText("Cod TVA")).toBeDefined();
      expect(screen.getByLabelText("Cod bancar (BIC / SWIFT)")).toBeDefined();
    });
  });

  it("butonul de reparare cheamă endpoint-ul, raportează câte rânduri a separat și reîncarcă", async () => {
    const { normalizeVendorRequisites, listVendors } = await import("@/lib/api/par");
    await openVendors();
    const callsBefore = (listVendors as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Separă codurile/i }));

    await waitFor(() => {
      expect(normalizeVendorRequisites).toHaveBeenCalledTimes(1);
      // Mesajul trebuie să SUPRAVIEȚUIASCĂ reîncărcării (care demontează secțiunea).
      expect(screen.getByText("1 din 3 beneficiari au fost separați.")).toBeDefined();
    });
    // Fără reîncărcare, tabelul ar rămâne pe datele vechi după reparare.
    expect((listVendors as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
