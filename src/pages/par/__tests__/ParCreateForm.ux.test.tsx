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

  it("„Caută companie” apare doar la persoană juridică", async () => {
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    // Implicit: juridic → butonul de registru companii e prezent.
    expect(screen.getByRole("button", { name: /caută companie/i })).toBeInTheDocument();

    // Comut pe persoană fizică → dispare (registrul de companii nu se aplică).
    fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /caută companie/i })).not.toBeInTheDocument()
    );
  });
});
