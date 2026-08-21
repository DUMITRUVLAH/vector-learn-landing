/**
 * PAR create form — ce vede utilizatorul după ce încarcă un act (feedback owner 2026-08-21):
 *   1. Avertismentul „Documentul nu pare a fi o factură" a DISPĂRUT — orice tip de act e valid.
 *   2. Când actul conține mai multe părți, ele sunt GRUPATE cu rechizitele lor, iar utilizatorul
 *      alege cine primește plata (nu mai e nevoie să reîncarce documentul).
 *   3. Când partea aleasă are mai multe conturi, întrebăm în care cont se face plata.
 *   4. Dacă AI-ul nu a putut fi contactat, scrie DE CE — nu mai apare doar eticheta „(demo)".
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

const field = (value: string | number | null, confidence = 0.9) => ({ value, confidence });

const BORDEI = {
  name: "Viorica Bordei",
  idno: "4841021002234",
  iban: "MD69ML000000022519094129",
  bank: "BC Moldindconbank S.A.",
  payeeType: "fizic" as const,
};
const ATIC = {
  name: "Asociatia Nationala a Companiilor din Domeniul TIC",
  idno: "1006600034927",
  iban: null,
  bank: null,
  payeeType: "juridic" as const,
};

function prefillResult(over: Partial<parApi.ParPrefillResult> = {}): parApi.ParPrefillResult {
  return {
    payeeName: field("Viorica Bordei"),
    payeeIdno: field("4841021002234"),
    payeeIban: field("MD69ML000000022519094129"),
    payeeBank: field("BC Moldindconbank S.A."),
    payeeBic: field(null, 0),
    payeeLegalAddress: field(null, 0),
    payeeAdministrator: field(null, 0),
    payeeType: { value: "fizic", confidence: 0.8 },
    totalCents: field(47145),
    currency: field("EUR"),
    endUse: field("Servicii de comunicare"),
    documentClass: { value: "not_invoice", confidence: 0.85, reason: "Act de primire-predare" },
    needsClarification: false,
    candidates: [],
    partyOptions: [
      { ...BORDEI, role: "provider", recommended: true, isPayer: false },
      { ...ATIC, role: "client", recommended: false, isPayer: true },
    ],
    lineItems: [],
    isStub: false,
    ...over,
  } as parApi.ParPrefillResult;
}

/** The beneficiary IBAN input (queried by id — the string "IBAN" also appears in the groups). */
const ibanInput = () => document.getElementById("pb") as HTMLInputElement;

/** Choose the AI method and upload a document, as a user would. */
async function uploadDocument() {
  render(<ParCreateForm />);
  await screen.findByRole("button", { name: /adaugă articol/i });
  fireEvent.click(screen.getByRole("button", { name: /din document \(ai\)/i }));

  const input = screen.getByLabelText(/Alege document pentru analiză AI/i) as HTMLInputElement;
  const file = new File(["%PDF-1.4"], "act-scanat.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ParCreateForm — după încărcarea unui act", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfigApis();
    // ensureDraft() reads `created.id` and then PATCHes the header — both must resolve or the
    // upload handler bails into its catch and nothing renders.
    vi.spyOn(parApi, "createPar").mockResolvedValue({ id: "par-1" } as never);
    vi.spyOn(parApi, "updatePar").mockResolvedValue({ id: "par-1" } as never);
  });

  it("[blocant] nu mai afișează avertismentul pe tipul actului", async () => {
    vi.spyOn(parApi, "prefillParFromDocument").mockResolvedValue(prefillResult());
    await uploadDocument();

    await screen.findByText(/Câmpuri propuse de AI/i);
    // Actul e un „act de primire-predare" (not_invoice) — și totuși NICIUN avertisment.
    expect(screen.queryByText(/nu pare a fi o factură/i)).not.toBeInTheDocument();
    expect(ibanInput()).toHaveValue("MD69ML000000022519094129");
  });

  it("[blocant] grupează părțile și permite schimbarea beneficiarului cu un click", async () => {
    vi.spyOn(parApi, "prefillParFromDocument").mockResolvedValue(prefillResult());
    await uploadDocument();

    await screen.findByText(/Am găsit 2 părți în document/i);
    const groups = within(screen.getByRole("radiogroup", { name: /Părțile găsite în document/i }));
    // Partea propusă de AI e marcată, plătitorul e vizibil dar marcat ca atare.
    expect(groups.getByText(/propus de AI/i)).toBeInTheDocument();
    expect(groups.getByText(/^plătitor$/i)).toBeInTheDocument();

    // Utilizatorul alege cealaltă parte → câmpurile beneficiarului se rescriu.
    fireEvent.click(groups.getByRole("radio", { name: /Asociatia Nationala/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Denumire companie/i)).toHaveValue(
        "Asociatia Nationala a Companiilor din Domeniul TIC",
      ),
    );
    expect(screen.getByLabelText(/IDNO/i)).toHaveValue("1006600034927");
  });

  it("[blocant] întreabă în ce cont se face plata când partea are mai multe conturi", async () => {
    const twoAccounts = {
      ...BORDEI,
      ibans: ["MD69ML000000022519094129", "MD35EX00000000123456789Z"],
    };
    vi.spyOn(parApi, "prefillParFromDocument").mockResolvedValue(
      prefillResult({
        partyOptions: [
          { ...twoAccounts, role: "provider", recommended: true, isPayer: false },
          { ...ATIC, role: "client", recommended: false, isPayer: true },
        ],
      }),
    );
    await uploadDocument();

    await screen.findByText(/În ce cont se face plata/i);
    const accounts = within(screen.getByRole("radiogroup", { name: /În ce cont se face plata/i }));
    fireEvent.click(accounts.getByRole("radio", { name: /MD35EX00000000123456789Z/i }));
    await waitFor(() => expect(ibanInput()).toHaveValue("MD35EX00000000123456789Z"));
  });

  it("[blocant] spune DE CE nu a mers AI-ul, în loc de eticheta „(demo)”", async () => {
    vi.spyOn(parApi, "prefillParFromDocument").mockResolvedValue(
      prefillResult({ isStub: true, aiUnavailable: "api_error" }),
    );
    await uploadDocument();

    await screen.findByText(/Serviciul AI nu a răspuns/i);
    expect(screen.queryByText(/\(demo\)/i)).not.toBeInTheDocument();
  });
});
