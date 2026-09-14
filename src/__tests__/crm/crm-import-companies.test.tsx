/**
 * CRM — interfața pentru import și pentru firme/duplicate.
 *
 * Testele de aici nu verifică aspectul, ci două promisiuni pe care ecranele
 * astea le fac omului și pe care nu au voie să le încalce:
 *
 *  1. IMPORTUL nu scrie nimic până la ultimul buton, iar numărul de pe buton e
 *     cel venit de la server — nu unul recalculat în browser, care s-ar putea
 *     despărți tăcut de realitate.
 *  2. UNIFICAREA nu se poate face „din reflex": butonul care scrie apare doar
 *     după ce omul a cerut și a văzut planul.
 *
 * Mock-uri după modelul din `crm-today.test.tsx` (același harness de shell).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Mocks de shell ───────────────────────────────────────────────────────────

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Andreea Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    members: [{ id: "user-1", fullName: "Andreea Admin", email: "andreea@test.local", role: "owner" }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/import", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

// ─── Mocks de date ────────────────────────────────────────────────────────────

const previewCrmImport = vi.fn();
const runCrmImport = vi.fn();
const listCrmImportJobs = vi.fn();
const listCrmImportMappings = vi.fn();
const saveCrmImportMapping = vi.fn();
const deleteCrmImportMapping = vi.fn();

vi.mock("@/lib/api/crmImport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmImport")>("@/lib/api/crmImport");
  return {
    ...actual,
    previewCrmImport: (...a: unknown[]) => previewCrmImport(...a),
    runCrmImport: (...a: unknown[]) => runCrmImport(...a),
    listCrmImportJobs: (...a: unknown[]) => listCrmImportJobs(...a),
    listCrmImportMappings: (...a: unknown[]) => listCrmImportMappings(...a),
    saveCrmImportMapping: (...a: unknown[]) => saveCrmImportMapping(...a),
    deleteCrmImportMapping: (...a: unknown[]) => deleteCrmImportMapping(...a),
  };
});

const listCrmCompanies = vi.fn();
const createCrmCompany = vi.fn();
const listCrmDuplicates = vi.fn();
const previewCrmMerge = vi.fn();
const mergeCrmLeads = vi.fn();

vi.mock("@/lib/api/crmCompanies", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmCompanies")>("@/lib/api/crmCompanies");
  return {
    ...actual,
    listCrmCompanies: (...a: unknown[]) => listCrmCompanies(...a),
    createCrmCompany: (...a: unknown[]) => createCrmCompany(...a),
    listCrmDuplicates: (...a: unknown[]) => listCrmDuplicates(...a),
    previewCrmMerge: (...a: unknown[]) => previewCrmMerge(...a),
    mergeCrmLeads: (...a: unknown[]) => mergeCrmLeads(...a),
  };
});

const { CrmImportPage } = await import("@/pages/business/crm/CrmImportPage");
const { CrmCompaniesPage } = await import("@/pages/business/crm/CrmCompaniesPage");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CSV = "Nume,Telefon\nIon Popescu,069391979\nMaria Ionescu,069222222";

function previewFixture(over: Record<string, unknown> = {}) {
  return {
    headers: ["Nume", "Telefon"],
    delimiter: ",",
    mapping: { 0: "full_name", 1: "phone" },
    counts: {
      total: 3,
      valid: 2,
      errors: 1,
      duplicatesInFile: 0,
      duplicatesInDb: 1,
      importableNew: 1,
      importableAll: 2,
    },
    stages: [{ key: "new", label: "Lead nou" }],
    owners: [{ id: "user-1", name: "Andreea Admin" }],
    truncated: false,
    rows: [
      {
        rowNumber: 1,
        draft: { rowNumber: 1, full_name: "Ion Popescu", phone: "069391979", email: null, company: null, value_cents: null, notes: null },
        status: "new",
        errors: [],
        warnings: [],
        resolved: { stage: "new", stageLabel: "Lead nou", source: "import", assignedTo: null, assignedToName: null, companyName: null },
      },
      {
        rowNumber: 2,
        draft: { rowNumber: 2, full_name: "Maria Ionescu", phone: "069222222", email: null, company: null, value_cents: null, notes: null },
        status: "duplicate_in_db",
        errors: [],
        warnings: [],
        resolved: { stage: "new", stageLabel: "Lead nou", source: "import", assignedTo: null, assignedToName: null, companyName: null },
      },
      {
        rowNumber: 3,
        draft: { rowNumber: 3, full_name: "", phone: null, email: null, company: null, value_cents: null, notes: null },
        status: "new",
        errors: ["Lipsește numele."],
        warnings: [],
        resolved: { stage: "new", stageLabel: "Lead nou", source: "import", assignedTo: null, assignedToName: null, companyName: null },
      },
    ],
    ...over,
  };
}

/** Duce ecranul de import până la pasul de verificare, cu textul lipit. */
async function goToVerification() {
  render(<CrmImportPage />);
  fireEvent.change(await screen.findByLabelText(/lipește direct tabelul/i), { target: { value: CSV } });
  fireEvent.click(screen.getByRole("button", { name: /citește fișierul/i }));
  await screen.findByText(/ce înseamnă fiecare coloană/i);
  fireEvent.click(screen.getByRole("button", { name: /vezi ce se va importa/i }));
  await screen.findByRole("button", { name: /^importă \d+ lead-uri$/i });
}

// ─── Importul ─────────────────────────────────────────────────────────────────

describe("Import — pașii", () => {
  beforeEach(() => {
    previewCrmImport.mockResolvedValue(previewFixture());
    listCrmImportJobs.mockResolvedValue({ items: [] });
    listCrmImportMappings.mockResolvedValue({ items: [] });
  });

  it("[blocant] nu scrie nimic până la butonul final", async () => {
    await goToVerification();
    // Am trecut prin toți pașii, am văzut tabelul — și totuși nimic n-a fost scris.
    expect(runCrmImport).not.toHaveBeenCalled();
  });

  it("[blocant] numărul de pe buton e cel venit de la server, nu unul recalculat", async () => {
    await goToVerification();
    // Fixture-ul are 3 rânduri, 2 valide, dintre care unul deja există →
    // serverul spune `importableNew: 1`. Butonul trebuie să spună exact 1.
    expect(screen.getByRole("button", { name: /importă 1 lead-uri/i })).toBeTruthy();
  });

  it("debifarea „sari peste duplicate\" schimbă numărul pe celălalt trimis de server", async () => {
    await goToVerification();
    fireEvent.click(screen.getByLabelText(/sari peste cele care există deja/i));
    expect(await screen.findByRole("button", { name: /importă 2 lead-uri/i })).toBeTruthy();
  });

  it("importul trimite exact opțiunea aleasă de om", async () => {
    runCrmImport.mockResolvedValue({ jobId: "j1", created: 1, skipped: 2, counts: previewFixture().counts, details: [] });
    await goToVerification();
    fireEvent.click(screen.getByRole("button", { name: /importă 1 lead-uri/i }));

    await waitFor(() => expect(runCrmImport).toHaveBeenCalled());
    expect(runCrmImport.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, text: CSV });
  });

  it("rândurile cu probleme își arată motivul, nu doar un semn de exclamare", async () => {
    await goToVerification();
    expect(screen.getByText(/lipsește numele/i)).toBeTruthy();
  });

  it("după import, omul vede câte au intrat și de ce au fost sărite celelalte", async () => {
    runCrmImport.mockResolvedValue({
      jobId: "j1",
      created: 1,
      skipped: 2,
      counts: previewFixture().counts,
      details: [
        { rowNumber: 2, reason: "Există deja în bază." },
        { rowNumber: 3, reason: "Lipsește numele." },
      ],
    });
    await goToVerification();
    fireEvent.click(screen.getByRole("button", { name: /importă 1 lead-uri/i }));

    expect(await screen.findByText(/am importat 1 lead/i)).toBeTruthy();
    expect(screen.getByText(/rândul 2: există deja în bază/i)).toBeTruthy();
  });

  it("o coloană remapată recere verdictul serverului, nu-l reface local", async () => {
    await goToVerification();
    fireEvent.click(screen.getByRole("button", { name: /înapoi la coloane/i }));
    previewCrmImport.mockClear();

    fireEvent.change(await screen.findByLabelText(/câmpul pentru coloana telefon/i), { target: { value: "email" } });
    await waitFor(() => expect(previewCrmImport).toHaveBeenCalled());
    expect(previewCrmImport.mock.calls[0][0].mapping).toMatchObject({ 1: "email" });
  });

  it("câmpurile care se scriu pe firmă sunt marcate ca atare", async () => {
    render(<CrmImportPage />);
    fireEvent.change(await screen.findByLabelText(/lipește direct tabelul/i), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: /citește fișierul/i }));
    await screen.findByText(/ce înseamnă fiecare coloană/i);

    fireEvent.change(screen.getByLabelText(/câmpul pentru coloana telefon/i), { target: { value: "industry" } });
    expect(await screen.findByText(/se salvează pe fișa firmei/i)).toBeTruthy();
  });

  it("eroarea de la server se arată omului, nu se înghite", async () => {
    previewCrmImport.mockRejectedValue(new Error("Fișierul e prea mare pentru un singur import."));
    render(<CrmImportPage />);
    fireEvent.change(await screen.findByLabelText(/lipește direct tabelul/i), { target: { value: CSV } });
    fireEvent.click(screen.getByRole("button", { name: /citește fișierul/i }));
    expect(await screen.findByText(/prea mare pentru un singur import/i)).toBeTruthy();
  });
});

// ─── Firme și duplicate ───────────────────────────────────────────────────────

const CLUSTER = {
  score: 0.95,
  reasons: ["telefon identic"],
  records: [
    {
      id: "lead-1",
      fullName: "Ion Popescu",
      phone: "069391979",
      email: null,
      company: "Agro Nord",
      stage: "new",
      valueCents: 10_000,
      assignedTo: null,
      notes: null,
    },
    {
      id: "lead-2",
      fullName: "Ion Popescu",
      phone: "069391979",
      email: "ion@x.md",
      company: null,
      stage: "contacted",
      valueCents: 25_000,
      assignedTo: null,
      notes: null,
    },
  ],
};

const PLAN = {
  primaryId: "lead-1",
  duplicateIds: ["lead-2"],
  fields: [{ field: "email", value: "ion@x.md", keep: "duplicate" }],
  valueCentsTotal: 35_000,
  debtCentsTotal: 0,
  reparented: [{ table: "interacțiuni", count: 4 }],
  keptTags: [],
  droppedTags: [],
};

describe("Firme și duplicate", () => {
  beforeEach(() => {
    listCrmCompanies.mockResolvedValue({ items: [] });
    listCrmDuplicates.mockResolvedValue({ clusters: [] });
  });

  it("lista de firme caută pe server, nu filtrează în memorie", async () => {
    render(<CrmCompaniesPage />);
    await waitFor(() => expect(listCrmCompanies).toHaveBeenCalled());
    listCrmCompanies.mockClear();

    fireEvent.change(screen.getByLabelText(/caută firma/i), { target: { value: "agro" } });
    await waitFor(() => expect(listCrmCompanies).toHaveBeenCalledWith("agro"), { timeout: 2000 });
  });

  it("[blocant] butonul care unifică apare doar după ce omul a văzut planul", async () => {
    listCrmDuplicates.mockResolvedValue({ clusters: [CLUSTER] });
    previewCrmMerge.mockResolvedValue({ plan: PLAN });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /unifică fișele/i }));

    // Deschis dialogul: încă NU există butonul care scrie.
    expect(screen.queryByRole("button", { name: /^unifică \d+ fișe$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /vezi ce se va întâmpla/i }));
    expect(await screen.findByRole("button", { name: /^unifică 2 fișe$/i })).toBeTruthy();
    expect(mergeCrmLeads).not.toHaveBeenCalled();
  });

  it("planul spune ce se completează și cât devine valoarea", async () => {
    listCrmDuplicates.mockResolvedValue({ clusters: [CLUSTER] });
    previewCrmMerge.mockResolvedValue({ plan: PLAN });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /unifică fișele/i }));
    fireEvent.click(screen.getByRole("button", { name: /vezi ce se va întâmpla/i }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/se completează cu/i)).toBeTruthy();
    expect(within(dialog).getByText(/350,00/)).toBeTruthy();
    expect(within(dialog).getByText(/4 × interacțiuni/)).toBeTruthy();
  });

  it("[blocant] schimbarea fișei păstrate anulează planul deja văzut", async () => {
    // Altfel omul ar putea confirma un plan calculat pentru ALTĂ fișă păstrată.
    listCrmDuplicates.mockResolvedValue({ clusters: [CLUSTER] });
    previewCrmMerge.mockResolvedValue({ plan: PLAN });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /unifică fișele/i }));
    fireEvent.click(screen.getByRole("button", { name: /vezi ce se va întâmpla/i }));
    await screen.findByRole("button", { name: /^unifică 2 fișe$/i });

    fireEvent.click(screen.getAllByRole("radio")[1]);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^unifică 2 fișe$/i })).toBeNull());
  });

  it("omul e avertizat că unificarea nu se desface, dar nici nu pierde fișa", async () => {
    listCrmDuplicates.mockResolvedValue({ clusters: [CLUSTER] });
    previewCrmMerge.mockResolvedValue({ plan: PLAN });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /unifică fișele/i }));
    fireEvent.click(screen.getByRole("button", { name: /vezi ce se va întâmpla/i }));

    expect(await screen.findByText(/nu se poate desface/i)).toBeTruthy();
    expect(screen.getByText(/rămân în bază, marcate/i)).toBeTruthy();
  });

  it("unificarea trimite fișa păstrată și duplicatele ei", async () => {
    listCrmDuplicates.mockResolvedValue({ clusters: [CLUSTER] });
    previewCrmMerge.mockResolvedValue({ plan: PLAN });
    mergeCrmLeads.mockResolvedValue({ ok: true });

    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    fireEvent.click(await screen.findByRole("button", { name: /unifică fișele/i }));
    fireEvent.click(screen.getByRole("button", { name: /vezi ce se va întâmpla/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^unifică 2 fișe$/i }));

    await waitFor(() => expect(mergeCrmLeads).toHaveBeenCalledWith({ primaryId: "lead-1", duplicateIds: ["lead-2"] }));
  });

  it("fără duplicate, ecranul spune că baza e curată — nu arată un tabel gol", async () => {
    render(<CrmCompaniesPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /duplicate/i }));
    expect(await screen.findByText(/nicio fișă dublată/i)).toBeTruthy();
  });
});
