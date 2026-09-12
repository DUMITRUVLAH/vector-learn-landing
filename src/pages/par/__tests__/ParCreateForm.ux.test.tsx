/**
 * PAR create form — UX feedback 2026-07-19 (owner Dumitru):
 *   1. [blocant] Butonul „Adaugă articol" trebuie să fie activ (albastru, clickabil) de la
 *      PRIMUL articol — el creează ciorna la nevoie, deci NU mai depinde de existența unui parId.
 *   2. Beneficiar: se alege întâi tipul (fizic/juridic), apoi o METODĂ (Introdu manual / Caută
 *      companie / Din document AI / Beneficiar salvat). Câmpurile apar abia după alegerea metodei,
 *      ca secțiunea să nu mai fie „greu de înțeles ce și cum".
 *   3. „Caută companie" apare doar pentru persoană juridică.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: vi.fn() }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "member" },
      tenant: { id: "t-1", name: "ATIC" },
    },
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
}

describe("ParCreateForm — UX (feedback owner 2026-07-19)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigApis();
  });

  it("[blocant] „Adaugă articol” e activ pe un formular nou (nu depinde de parId)", async () => {
    render(<ParCreateForm />);
    const addBtn = await screen.findByRole("button", { name: /adaugă articol/i });
    expect(addBtn).not.toBeDisabled();
  });

  it("beneficiar: câmpurile apar abia după alegerea unei metode", async () => {
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    // Înainte de a alege o metodă, câmpul „Denumire companie" NU e vizibil.
    expect(screen.queryByLabelText(/Denumire companie/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Alege o metodă de mai sus/i)).toBeInTheDocument();

    // Aleg „Introdu manual" → câmpurile beneficiarului apar.
    fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Denumire companie/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/^IBAN/i)).toBeInTheDocument();
  });

  /**
   * Owner, 2026-09-12: „când cauți compania să nu fie scris introducere manuală, dar alege din
   * companiile salvate, și când cauți în search automat să apară — nu să cauți și după să apeși
   * pe introducere manuală ca să vezi dropdown."
   */
  it("companii salvate: rezultatele apar pe măsură ce scrii, fără „Introducere manuală” în listă", async () => {
    vi.spyOn(parApi, "listVendors").mockResolvedValue({
      items: [
        { id: "v-1", name: "S.C. Vector Academy S.R.L.", idnp: "1002600020555", iban: "MD24AG000225100013104168", bank: null, active: true },
        { id: "v-2", name: "ATIC SRL", idnp: null, iban: null, bank: null, active: true },
      ],
    });
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    fireEvent.click(screen.getByRole("button", { name: /companii salvate/i }));

    // Lista se vede imediat, fără dropdown de deschis.
    expect(await screen.findByRole("option", { name: /Vector Academy/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /ATIC/i })).toBeInTheDocument();
    // „Introducere manuală" nu mai e o linie în listă — are butonul ei de metodă, sus.
    expect(screen.queryByText(/Introducere manuală/i)).not.toBeInTheDocument();

    // Se scrie în căutare → lista se strânge singură, fără alt clic.
    fireEvent.change(screen.getByLabelText(/caută în companii salvate/i), { target: { value: "vector" } });
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /ATIC/i })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("option", { name: /Vector Academy/i })).toBeInTheDocument();
  });

  /**
   * Owner, 2026-09-12: „dacă eu am pus întâi la companii salvate și după caut din surse publice,
   * să fie goale rândurile, nu să le șterg manual."
   */
  it("schimbarea metodei pornește pe curat — rechizitele beneficiarului anterior nu rămân pe ecran", async () => {
    vi.spyOn(parApi, "listVendors").mockResolvedValue({
      items: [{ id: "v-1", name: "S.C. Vector Academy S.R.L.", idnp: "1002600020555", iban: "MD24AG000225100013104168", bank: "BC Maib S.A.", active: true }],
    });
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    fireEvent.click(screen.getByRole("button", { name: /companii salvate/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Vector Academy/i }));
    expect((screen.getByLabelText(/Denumire companie/i) as HTMLInputElement).value).toContain("Vector Academy");
    expect((screen.getByLabelText(/^IBAN/i, { selector: "input" }) as HTMLInputElement).value).toBe("MD24AG000225100013104168");

    // Trec pe căutarea în surse publice → câmpurile se golesc singure.
    fireEvent.click(screen.getByRole("button", { name: /caută companii din surse publice/i }));
    await waitFor(() =>
      expect((screen.getByLabelText(/Denumire companie/i) as HTMLInputElement).value).toBe("")
    );
    expect((screen.getByLabelText(/^IBAN/i, { selector: "input" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/^IDNO/i, { selector: "input" }) as HTMLInputElement).value).toBe("");
  });

  /** „Introdu manual" e excepția: înseamnă „corectez ce e aici", nu „șterge tot". */
  it("„Introdu manual” păstrează ce e completat — doar desface legătura cu beneficiarul salvat", async () => {
    vi.spyOn(parApi, "listVendors").mockResolvedValue({
      items: [{ id: "v-1", name: "S.C. Vector Academy S.R.L.", idnp: "1002600020555", iban: "MD24AG000225100013104168", bank: "BC Maib S.A.", active: true }],
    });
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    fireEvent.click(screen.getByRole("button", { name: /companii salvate/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Vector Academy/i }));
    fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));

    expect((screen.getByLabelText(/Denumire companie/i) as HTMLInputElement).value).toContain("Vector Academy");
    expect((screen.getByLabelText(/^IBAN/i, { selector: "input" }) as HTMLInputElement).value).toBe("MD24AG000225100013104168");
  });

  it("„Caută companii din surse publice” apare doar la persoană juridică", async () => {
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    // Implicit: juridic → butonul de registru companii e prezent.
    expect(screen.getByRole("button", { name: /caută companii din surse publice/i })).toBeInTheDocument();

    // Comut pe persoană fizică → dispare (registrul de companii nu se aplică).
    fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /caută companii din surse publice/i })).not.toBeInTheDocument()
    );
  });
});
