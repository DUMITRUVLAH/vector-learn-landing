/**
 * PAR create form — bug raportat de un utilizator: pe „Cod bugetar" apeși X și nu se
 * întâmplă nimic; codul rămâne în câmp.
 *
 * Cauza nu era butonul (Combobox-ul chiar trimitea onChange("")), ci comoditatea din
 * formular: când scopul plătitor+proiect avea exact un cod eligibil, efectul completa
 * automat codul DE FIECARE DATĂ când câmpul era gol — deci și imediat după ștergere.
 * Auto-completarea se oferă o dată per scop; ștergerea trebuie să rămână ștearsă.
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

const PAYER = {
  id: "p-1", name: "ATIC Tekwill", legalName: null, idno: null, active: true,
} as parApi.ParPayer;

const CODE = {
  id: "b-1", payerId: "p-1", projectId: null, code: "Promovare Tekwill",
  name: "Promovare", active: true,
} as parApi.ParBudgetCode;

describe("ParCreateForm — „Cod bugetar”: X șterge selecția și ea rămâne ștearsă", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
    vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] });
    vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] });
    vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 });
    vi.spyOn(parApi, "getMyParProfile").mockResolvedValue({ profile: null, projectIds: [], payerIds: [] });
    vi.spyOn(parApi, "listPayers").mockResolvedValue({ items: [PAYER] });
    vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [CODE] });
    vi.spyOn(parApi, "getBudgetCodeBalance").mockResolvedValue({
      allocatedCents: 0, spentCents: 0, availableCents: 0,
    } as Awaited<ReturnType<typeof parApi.getBudgetCodeBalance>>);
  });

  it("singurul cod eligibil se completează automat, dar X îl șterge definitiv", async () => {
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });

    // Aleg plătitorul → scopul are un singur cod eligibil, deci se completează automat.
    const payer = screen.getByLabelText(/Plătitor \/ Organizație/i) as HTMLSelectElement;
    await waitFor(() => expect(payer.querySelector('option[value="p-1"]')).not.toBeNull());
    fireEvent.change(payer, { target: { value: "p-1" } });
    const codeField = () => screen.getByLabelText("Cod bugetar") as HTMLInputElement;
    await waitFor(() => expect(codeField().value).toBe("Promovare Tekwill"));

    // Apăs X, apoi ies din câmp — cât timp lista e deschisă, câmpul arată căutarea, nu
    // selecția, deci doar după blur se vede starea reală (aici revenea codul șters).
    fireEvent.click(screen.getByRole("button", { name: /șterge selecția/i }));
    fireEvent.blur(codeField());
    await new Promise((r) => setTimeout(r, 100));
    expect(codeField().value).toBe("");
    // Și butonul de ștergere dispare, pentru că nu mai există selecție.
    expect(screen.queryByRole("button", { name: /șterge selecția/i })).not.toBeInTheDocument();
  });
});
