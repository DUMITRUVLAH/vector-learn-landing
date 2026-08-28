/**
 * „Organizații plătitoare" — datele complete ale FIECĂREI entități care achită.
 *
 * Cerut de owner (2026-08-28) peste captura din „Administrare PAR → Setări": „vreau să pot seta
 * mai multă info despre organizația care achită și nu uita că putem avea mai multe organizații
 * care plătesc în același workspace". Setările tenantului sunt unice, deci identitatea (IDNO,
 * cod TVA, adresă, cont bancar, semnatar, logo) stă pe fiecare plătitor în parte.
 *
 * Testăm ACȚIUNEA, nu doar randarea (CLAUDE.md §3.5.1quater): formularul chiar trimite câmpurile
 * către API și lista se reîncarcă.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParAdmin } from "../ParAdmin";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/admin", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  const atic = {
    id: "p-1",
    name: "ATIC",
    legalName: "Asociația Națională a Companiilor din Domeniul TIC",
    idno: "1012620008289",
    vatCode: "0301234",
    address: "str. Maria Cebotari 37, mun. Chișinău",
    bankName: 'BC "MAIB" S.A.',
    iban: "MD24AG000225100013104168",
    bankCode: "AGRNMD2X885",
    contactEmail: null,
    contactPhone: null,
    directorName: "Ana Popescu",
    directorRole: "Director executiv",
    logoUrl: null,
    notes: null,
    active: true,
  };
  const fundatia = {
    id: "p-2",
    name: "Fundația Vector",
    legalName: "A.O. Fundația Vector",
    idno: null,
    active: true,
  };
  return {
    ...actual,
    listParDoaMatrix: vi.fn().mockResolvedValue({ rows: [] }),
    getParSettings: vi.fn().mockResolvedValue({
      microPurchaseThresholdCents: 1000000,
      defaultCurrency: "MDL",
      orgLegalName: null,
      orgLogoUrl: null,
      pdfHelpUrl: null,
      requestNoPrefix: "PAR",
    }),
    updateParSettings: vi.fn().mockResolvedValue({}),
    listPayers: vi.fn().mockResolvedValue({ items: [atic, fundatia] }),
    createPayer: vi.fn().mockResolvedValue({ id: "p-3" }),
    updatePayer: vi.fn().mockResolvedValue({ id: "p-1" }),
    listParMembers: vi.fn().mockResolvedValue({ members: [] }),
    listParMemberCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
    listDepartments: vi.fn().mockResolvedValue({ items: [] }),
    listProjects: vi.fn().mockResolvedValue({ items: [] }),
    listBudgetCodes: vi.fn().mockResolvedValue({ items: [] }),
    listEvents: vi.fn().mockResolvedValue({ events: [] }),
    listVendors: vi.fn().mockResolvedValue({ items: [] }),
    searchRegistryCompanies: vi.fn().mockResolvedValue([]),
    formatMDL: (cents: number) => `${(cents / 100).toLocaleString()} MDL`,
  };
});

/** Fila „Date de referință" → secțiunea „Organizații plătitoare". */
async function openPayers() {
  render(<ParAdmin isAdmin />);
  fireEvent.click(await screen.findByRole("tab", { name: /Date de referință/i }));
  fireEvent.click(await screen.findByRole("tab", { name: /Organizații plătitoare/i }));
  return screen.findByText("ATIC");
}

describe("Organizații plătitoare", () => {
  beforeEach(() => vi.clearAllMocks());

  it("arată datele complete ale fiecărei organizații, nu doar denumirea", async () => {
    await openPayers();
    expect(screen.getByText("Asociația Națională a Companiilor din Domeniul TIC")).toBeDefined();
    expect(screen.getByText("1012620008289")).toBeDefined();
    expect(screen.getByText("0301234")).toBeDefined();
    expect(screen.getByText("MD24AG000225100013104168")).toBeDefined();
    expect(screen.getByText("AGRNMD2X885")).toBeDefined();
    expect(screen.getByText("Ana Popescu")).toBeDefined();
  });

  it("mai multe organizații coexistă; cea fără date primește un îndemn, nu rânduri goale", async () => {
    await openPayers();
    expect(screen.getByText("Fundația Vector")).toBeDefined();
    expect(screen.getByText(/Doar denumirea e completată/)).toBeDefined();
  });

  it("[blocant] adăugarea trimite toate rechizitele la API și reîncarcă lista", async () => {
    const { createPayer, listPayers } = await import("@/lib/api/par");
    await openPayers();
    const callsBefore = (listPayers as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.click(screen.getByLabelText("Adaugă organizație plătitoare"));
    fireEvent.change(await screen.findByLabelText(/Denumire scurtă/), { target: { value: "SRL Nou" } });
    fireEvent.change(screen.getByLabelText("IDNO / cod fiscal"), { target: { value: "1015600001234" } });
    fireEvent.change(screen.getByLabelText("IBAN"), { target: { value: "md03 ag00 0000 0225 1232 3419" } });
    fireEvent.change(screen.getByLabelText("Funcție"), { target: { value: "Administrator" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvează/ }));

    await waitFor(() => {
      expect(createPayer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "SRL Nou",
          idno: "1015600001234",
          // IBAN-ul se normalizează (fără spații, majuscule) înainte de salvare.
          iban: "MD03AG000000022512323419",
          director_role: "Administrator",
          address: null,
        }),
      );
    });
    expect((listPayers as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("editarea unei organizații pre-completează formularul cu datele ei", async () => {
    const { updatePayer } = await import("@/lib/api/par");
    await openPayers();
    fireEvent.click(screen.getByLabelText("Editează datele organizației ATIC"));

    const idno = (await screen.findByLabelText("IDNO / cod fiscal")) as HTMLInputElement;
    expect(idno.value).toBe("1012620008289");
    fireEvent.change(screen.getByLabelText("Telefon"), { target: { value: "+373 22 000 000" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvează/ }));

    await waitFor(() => {
      expect(updatePayer).toHaveBeenCalledWith(
        "p-1",
        expect.objectContaining({ contact_phone: "+373 22 000 000", idno: "1012620008289" }),
      );
    });
  });

  it("un IBAN greșit avertizează, dar nu blochează salvarea", async () => {
    await openPayers();
    fireEvent.click(screen.getByLabelText("Adaugă organizație plătitoare"));
    fireEvent.change(await screen.findByLabelText("IBAN"), { target: { value: "MD24AG000225100013104169" } });
    await waitFor(() => expect(screen.getByText(/IBAN invalid/)).toBeDefined());
    expect((screen.getByRole("button", { name: /Salvează/ }) as HTMLButtonElement).disabled).toBe(true); // lipsește denumirea
    fireEvent.change(screen.getByLabelText(/Denumire scurtă/), { target: { value: "Test SRL" } });
    expect((screen.getByRole("button", { name: /Salvează/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("puntea din Setări", () => {
  beforeEach(() => vi.clearAllMocks());

  it("butonul din Setări duce direct la lista de organizații plătitoare", async () => {
    render(<ParAdmin isAdmin />);
    fireEvent.click(await screen.findByRole("tab", { name: /Setări/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Organizații plătitoare/ }));
    // Nu doar comută fila: deschide chiar secțiunea plătitorilor.
    expect(await screen.findByText("ATIC")).toBeDefined();
    expect(screen.getByLabelText("Adaugă organizație plătitoare")).toBeDefined();
  });
});
