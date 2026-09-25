/**
 * CRM (Faza 1) — smoke tests de UI pentru lansator, kanban, fișa leadului, editorul de etape și
 * produse. Mock-uri după modelul din `src/__tests__/docmerge/docmerge-001-ui.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api";
import type { CrmLead, CrmLeadInteraction, CrmPipelineResponse, CrmProduct, CrmStage } from "@/lib/api/crm";

// Fiecare mock e un `vi.fn()` la nivel de modul, PARTAJAT între teste — fără curățare, un
// `toHaveBeenCalled()`/`not.toHaveBeenCalled()` ar vedea apelurile testelor anterioare.
// `clearAllMocks` șterge doar istoricul de apeluri, nu și `mockResolvedValue`-urile setate în
// fiecare test (acelea sunt setate explicit, la începutul fiecărui test, oricum).
beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Test Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

// LeadDetailSheet foloseşte hook-ul real de echipă (`src/hooks/useTeamMembers.ts`) pentru
// select-ul „Responsabil" — mock-uit ca să nu iasă un `fetch` real către `/api/team/members`
// într-un test de unitate.
vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    members: [{ id: "user-1", fullName: "Test Admin", email: "admin@test.local", role: "owner" }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const getCrmPipeline = vi.fn();
const createCrmLead = vi.fn();
const moveCrmLeadStage = vi.fn();
const getCrmLeadDetail = vi.fn();
const updateCrmLead = vi.fn();
const createCrmLeadInteraction = vi.fn();
const createCrmStage = vi.fn();
const updateCrmStage = vi.fn();
const deleteCrmStage = vi.fn();
const reorderCrmStages = vi.fn();
const listCrmProducts = vi.fn();
const createCrmProduct = vi.fn();
const updateCrmProduct = vi.fn();
const archiveCrmProduct = vi.fn();
const restoreCrmProduct = vi.fn();
const listCrmLostReasons = vi.fn();
const listCrmLeadTasks = vi.fn();
const createCrmLeadTask = vi.fn();
const updateCrmLeadTask = vi.fn();
const completeCrmLeadTask = vi.fn();
const reopenCrmLeadTask = vi.fn();
const snoozeCrmLeadTask = vi.fn();
const deleteCrmLeadTask = vi.fn();
const listCrmLeadTags = vi.fn();
const addCrmLeadTag = vi.fn();
const removeCrmLeadTag = vi.fn();
const listCrmTagSuggestions = vi.fn();

// Motivele configurate ale tenantului — folosite de `LostReasonDialog`, care nu mai citește un
// `const` fix din front-end (vezi componenta). Valoare implicită la nivel de modul: persistă între
// teste (`vi.clearAllMocks()` NU șterge implementarea `mockResolvedValue`), ca testele care nu
// verifică explicit lista de motive să nu se rupă doar fiindcă n-o mochează ele înșiși.
listCrmLostReasons.mockResolvedValue({
  items: [
    { id: "lr-1", tenantId: "t1", label: "Preț prea mare", orderIndex: 0, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "lr-2", tenantId: "t1", label: "A ales alt furnizor", orderIndex: 1, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "lr-3", tenantId: "t1", label: "Nu mai are nevoie", orderIndex: 2, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "lr-4", tenantId: "t1", label: "Nu răspunde", orderIndex: 3, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "lr-5", tenantId: "t1", label: "Buget amânat", orderIndex: 4, createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "lr-6", tenantId: "t1", label: "Altul", orderIndex: 5, createdAt: "2026-01-01T00:00:00.000Z" },
  ],
});
// Idem: liste goale implicite pentru taskuri/etichete, ca fișa leadului să nu crape în testele
// care nu au nimic de-a face cu ele.
listCrmLeadTasks.mockResolvedValue({ items: [] });
// Fișa leadului cere catalogul de produse pentru select-ul „Produs"; testele care nu-l verifică
// n-au de ce să-l moacheze fiecare în parte.
listCrmProducts.mockResolvedValue({ items: [] });
listCrmLeadTags.mockResolvedValue({ items: [] });
listCrmTagSuggestions.mockResolvedValue({ items: [] });

vi.mock("@/lib/api/crm", () => ({
  // Fișa arată acum câmpurile personalizate și cadențele FĂRĂ să mai treacă prin fila
  // „Detalii" — deci le cere la deschidere. Fără dublurile astea, un `vi.mock` incomplet
  // aruncă într-un efect, iar React demontează tot arborele (testul vede un ecran gol).
  listCrmCustomFields: vi.fn().mockResolvedValue({ items: [] }),
  listCrmLeadFieldValues: vi.fn().mockResolvedValue({ items: [] }),
  setCrmLeadFieldValue: vi.fn().mockResolvedValue({}),
  listCrmCadences: vi.fn().mockResolvedValue({ items: [] }),
  listCrmLeadEnrollments: vi.fn().mockResolvedValue({ items: [] }),
  // Panoul GDPR stă acum lângă datele persoanei, deci se randează odată cu fișa.
  crmGdprExportUrl: (id: string) => `/api/crm/gdpr/export/${id}`,
  revokeCrmLeadConsent: vi.fn().mockResolvedValue({}),
  anonymizeCrmLead: vi.fn().mockResolvedValue({}),
  // Drepturile utilizatorului: ecranele CRM le cer ca să știe ce butoane să arate.
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["leads.view_all", "leads.edit", "pipelines.manage", "products.manage", "cadences.manage", "automations.manage", "assignment.manage", "audit.view"] }),
  getCrmPipeline: (...args: unknown[]) => getCrmPipeline(...args),
  createCrmLead: (...args: unknown[]) => createCrmLead(...args),
  moveCrmLeadStage: (...args: unknown[]) => moveCrmLeadStage(...args),
  getCrmLeadDetail: (...args: unknown[]) => getCrmLeadDetail(...args),
  updateCrmLead: (...args: unknown[]) => updateCrmLead(...args),
  createCrmLeadInteraction: (...args: unknown[]) => createCrmLeadInteraction(...args),
  createCrmStage: (...args: unknown[]) => createCrmStage(...args),
  updateCrmStage: (...args: unknown[]) => updateCrmStage(...args),
  deleteCrmStage: (...args: unknown[]) => deleteCrmStage(...args),
  reorderCrmStages: (...args: unknown[]) => reorderCrmStages(...args),
  listCrmProducts: (...args: unknown[]) => listCrmProducts(...args),
  createCrmProduct: (...args: unknown[]) => createCrmProduct(...args),
  updateCrmProduct: (...args: unknown[]) => updateCrmProduct(...args),
  archiveCrmProduct: (...args: unknown[]) => archiveCrmProduct(...args),
  restoreCrmProduct: (...args: unknown[]) => restoreCrmProduct(...args),
  listCrmLostReasons: (...args: unknown[]) => listCrmLostReasons(...args),
  listCrmLeadTasks: (...args: unknown[]) => listCrmLeadTasks(...args),
  createCrmLeadTask: (...args: unknown[]) => createCrmLeadTask(...args),
  updateCrmLeadTask: (...args: unknown[]) => updateCrmLeadTask(...args),
  completeCrmLeadTask: (...args: unknown[]) => completeCrmLeadTask(...args),
  reopenCrmLeadTask: (...args: unknown[]) => reopenCrmLeadTask(...args),
  snoozeCrmLeadTask: (...args: unknown[]) => snoozeCrmLeadTask(...args),
  deleteCrmLeadTask: (...args: unknown[]) => deleteCrmLeadTask(...args),
  listCrmLeadTags: (...args: unknown[]) => listCrmLeadTags(...args),
  addCrmLeadTag: (...args: unknown[]) => addCrmLeadTag(...args),
  removeCrmLeadTag: (...args: unknown[]) => removeCrmLeadTag(...args),
  listCrmTagSuggestions: (...args: unknown[]) => listCrmTagSuggestions(...args),
  // Pâlnii multiple (Faza 9) — mock-uri inerte aici: acest fișier testează o singură pâlnie.
  listCrmPipelines: vi.fn().mockResolvedValue({ items: [] }),
  createCrmPipeline: vi.fn(),
  renameCrmPipeline: vi.fn(),
  deleteCrmPipeline: vi.fn(),
  moveCrmLeadPipeline: vi.fn(),
  listCrmSavedViews: vi.fn().mockResolvedValue({ items: [] }),
  listCrmUpcomingTasks: vi.fn().mockResolvedValue({ items: [] }),
  createCrmSavedView: vi.fn(),
  deleteCrmSavedView: vi.fn(),
  listCrmLeads: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 }),
}));

const { CrmPipelinePage } = await import("@/pages/business/crm/CrmPipelinePage");
const { CrmProductsPage } = await import("@/pages/business/crm/CrmProductsPage");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLead(overrides: Partial<CrmLead>): CrmLead {
  return {
    id: "lead-1",
    fullName: "Maria Popescu",
    dealName: null,
    phone: "+373 6900 0000",
    email: null,
    company: null,
    interestCourse: "Engleză B2",
    source: "facebook_ad",
    stage: "new",
    valueCents: 0,
    assignedTo: null,
    lostReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Oglindesc `CRM_DEFAULT_STAGES` din `constants.ts` — testele nu importă constanta direct, ca
 *  să verifice contractul API-ului (`stages` din `/pipeline`), nu implementarea fallback-ului. */
const DEFAULT_STAGES: CrmStage[] = [
  { id: "new", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "contacted", key: "contacted", label: "Contactat", color: "lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, probabilityPct: 25 },
  { id: "trial", key: "trial", label: "Trial/Demo", color: "peach", orderIndex: 2, isWon: false, isLost: false, isDefault: true, probabilityPct: 50 },
  { id: "paid", key: "paid", label: "Client", color: "mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true, probabilityPct: 100 },
  { id: "lost", key: "lost", label: "Pierdut", color: "rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, probabilityPct: 0 },
];

function makePipeline(leads: CrmLead[], stages: CrmStage[] = DEFAULT_STAGES): CrmPipelineResponse {
  const grouped: Record<string, CrmLead[]> = {};
  const counts: Record<string, number> = {};
  for (const stage of stages) {
    grouped[stage.key] = [];
    counts[stage.key] = 0;
  }
  for (const lead of leads) {
    grouped[lead.stage] = [...(grouped[lead.stage] ?? []), lead];
    counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
  }
  return { grouped, counts, valueSums: {}, totalValueCents: 0, stages };
}

function makeInteraction(overrides: Partial<CrmLeadInteraction>): CrmLeadInteraction {
  return {
    id: "int-1",
    leadId: "lead-1",
    type: "note",
    direction: "internal",
    body: "Notă",
    metadata: null,
    userId: null,
    occurredAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeProduct(overrides: Partial<CrmProduct>): CrmProduct {
  return {
    id: "prod-1",
    sku: "ABC",
    name: "Curs Engleză",
    category: null,
    description: null,
    unit: "lună",
    listPriceCents: 150000,
    currency: "MDL",
    vatPercent: 20,
    isActive: true,
    orderIndex: 0,
    ...overrides,
  };
}

// ─── Teste ────────────────────────────────────────────────────────────────────

describe("CRM (Faza 1) — CrmPipelinePage", () => {
  it("kanbanul afișează cele 5 etape cu numărul de leaduri", async () => {
    getCrmPipeline.mockResolvedValue(
      makePipeline([
        makeLead({ id: "l1", fullName: "Maria Popescu", stage: "new" }),
        makeLead({ id: "l2", fullName: "Andrei Rusu", stage: "paid" }),
      ])
    );

    render(<CrmPipelinePage />);

    // Randat de două ori (grila desktop + lista mobilă) — vezi comentariul din CrmPipelinePage.
    await screen.findAllByText("Maria Popescu");

    for (const label of ["Lead nou", "Contactat", "Trial/Demo", "Client", "Pierdut"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }

    // 2 leaduri, 1 convertit (paid, etapă `isWon`) → conversie 50%, arătat în antetul paginii.
    expect(screen.getByText(/2 leaduri · conversie 50%/)).toBeInTheDocument();
  });

  it("mutarea unui lead în „Pierdut” cere motivul înainte de a salva", async () => {
    getCrmPipeline.mockResolvedValue(makePipeline([makeLead({ id: "l1", fullName: "Maria Popescu", stage: "new" })]));
    moveCrmLeadStage.mockResolvedValue(makeLead({ id: "l1", fullName: "Maria Popescu", stage: "lost" }));

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");

    const [stageSelect] = screen.getAllByLabelText(/Mutare stadiu pentru Maria Popescu/i);
    fireEvent.change(stageSelect, { target: { value: "lost" } });

    // Modalul cere motivul — API-ul NU e apelat încă.
    expect(await screen.findByText("Motiv pierdere")).toBeInTheDocument();
    expect(moveCrmLeadStage).not.toHaveBeenCalled();

    // Motivele se încarcă async (GET /api/crm/lost-reasons) — findByText așteaptă fetch-ul.
    fireEvent.click(await screen.findByText("Nu răspunde"));
    fireEvent.click(screen.getByRole("button", { name: /Marchează pierdut/i }));

    await waitFor(() => {
      expect(moveCrmLeadStage).toHaveBeenCalledWith("l1", { stage: "lost", lostReason: "Nu răspunde" });
    });
  });

  it("coloanele tablei vin din etapele configurate, nu dintr-o listă fixă", async () => {
    const customStages: CrmStage[] = [
      { id: "s1", key: "interes", label: "Interes inițial", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: false, probabilityPct: 10 },
      { id: "s2", key: "negociere", label: "Negociere activă", color: "peach", orderIndex: 1, isWon: false, isLost: false, isDefault: false, probabilityPct: 40 },
      { id: "s3", key: "castigat", label: "Câștigat", color: "mint", orderIndex: 2, isWon: true, isLost: false, isDefault: false, probabilityPct: 100 },
    ];
    getCrmPipeline.mockResolvedValue(
      makePipeline([makeLead({ id: "l1", fullName: "Maria Popescu", stage: "interes" })], customStages)
    );

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");

    for (const label of ["Interes inițial", "Negociere activă", "Câștigat"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
    // Etapele implicite NU mai apar — board-ul nu are voie să cadă pe o listă hardcodată.
    // Scopat pe <main>: butonul „Lead nou" din meniul CRM (CRM-G01) nu e o coloană a tablei.
    const board = within(screen.getByRole("main"));
    expect(board.queryByText("Lead nou")).not.toBeInTheDocument();
    expect(board.queryByText("Trial/Demo")).not.toBeInTheDocument();
  });

  it("mutarea într-o etapă marcată „pierdut” cere motivul, chiar dacă etapa nu se numește „lost”", async () => {
    const customStages: CrmStage[] = [
      { id: "s1", key: "interes", label: "Interes inițial", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: false, probabilityPct: 10 },
      { id: "s2", key: "arhivat", label: "Arhivat", color: "rose", orderIndex: 1, isWon: false, isLost: true, isDefault: false, probabilityPct: 0 },
    ];
    getCrmPipeline.mockResolvedValue(
      makePipeline([makeLead({ id: "l1", fullName: "Maria Popescu", stage: "interes" })], customStages)
    );
    moveCrmLeadStage.mockResolvedValue(makeLead({ id: "l1", fullName: "Maria Popescu", stage: "arhivat" }));

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");

    const [stageSelect] = screen.getAllByLabelText(/Mutare stadiu pentru Maria Popescu/i);
    fireEvent.change(stageSelect, { target: { value: "arhivat" } });

    // „Arhivat" nu conține nici „pierdut", nici „lost" — promptul trebuie să vină din flag-ul
    // `isLost` al etapei, nu dintr-o comparație pe text.
    expect(await screen.findByText("Motiv pierdere")).toBeInTheDocument();
    expect(moveCrmLeadStage).not.toHaveBeenCalled();

    // Motivele se încarcă async (GET /api/crm/lost-reasons) — findByText așteaptă fetch-ul.
    fireEvent.click(await screen.findByText("Nu răspunde"));
    fireEvent.click(screen.getByRole("button", { name: /Marchează pierdut/i }));

    await waitFor(() => {
      expect(moveCrmLeadStage).toHaveBeenCalledWith("l1", { stage: "arhivat", lostReason: "Nu răspunde" });
    });
  });
});

describe("CRM (Faza 1) — LeadDetailSheet", () => {
  it("un click pe cartonaș deschide fișa leadului cu datele lui", async () => {
    const lead = makeLead({
      id: "l1",
      fullName: "Maria Popescu",
      stage: "new",
      phone: "+373 690 00 00",
      company: "Acme SRL",
    });
    getCrmPipeline.mockResolvedValue(makePipeline([lead]));
    getCrmLeadDetail.mockResolvedValue({ lead, interactions: [], stage: DEFAULT_STAGES[0] });

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");

    fireEvent.click(screen.getAllByRole("button", { name: /Deschide lead Maria Popescu/i })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "Maria Popescu" });
    await waitFor(() => expect(getCrmLeadDetail).toHaveBeenCalledWith("l1"));
    expect(within(dialog).getByText("Acme SRL")).toBeInTheDocument();
    // Acțiunea rapidă „Sună" folosește telefonul REAL al leadului, nu un placeholder.
    expect(within(dialog).getByRole("link", { name: /Sună/i })).toHaveAttribute("href", "tel:+373 690 00 00");
    // Etapa curentă e preselectată în select-ul „Etapă" din antet.
    expect(within(dialog).getByLabelText("Etapă")).toHaveValue("new");
  });

  it("fișa arată istoricul interacțiunilor, cel mai recent primul", async () => {
    const lead = makeLead({ id: "l1", fullName: "Maria Popescu", stage: "new" });
    getCrmPipeline.mockResolvedValue(makePipeline([lead]));
    getCrmLeadDetail.mockResolvedValue({
      lead,
      interactions: [
        makeInteraction({ id: "int-2", type: "call", body: "A doua discuție", occurredAt: "2026-01-02T10:00:00.000Z" }),
        makeInteraction({ id: "int-1", type: "note", body: "Prima notă", occurredAt: "2026-01-01T10:00:00.000Z" }),
      ],
      stage: DEFAULT_STAGES[0],
    });

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");
    fireEvent.click(screen.getAllByRole("button", { name: /Deschide lead Maria Popescu/i })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "Maria Popescu" });
    await within(dialog).findByText("A doua discuție");

    const items = within(dialog).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("A doua discuție");
    expect(items[1]).toHaveTextContent("Prima notă");
  });

  it("adăugarea unei note apare imediat în istoric", async () => {
    const lead = makeLead({ id: "l1", fullName: "Maria Popescu", stage: "new" });
    getCrmPipeline.mockResolvedValue(makePipeline([lead]));
    getCrmLeadDetail.mockResolvedValue({ lead, interactions: [], stage: DEFAULT_STAGES[0] });
    createCrmLeadInteraction.mockResolvedValue(
      makeInteraction({ id: "int-new", type: "note", body: "Vrea reprogramare joi" })
    );

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");
    fireEvent.click(screen.getAllByRole("button", { name: /Deschide lead Maria Popescu/i })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "Maria Popescu" });
    await waitFor(() => expect(getCrmLeadDetail).toHaveBeenCalled());

    const textarea = within(dialog).getByLabelText("Notă nouă");
    fireEvent.change(textarea, { target: { value: "Vrea reprogramare joi" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Adaugă notă/i }));

    await waitFor(() => {
      expect(createCrmLeadInteraction).toHaveBeenCalledWith("l1", { type: "note", body: "Vrea reprogramare joi" });
    });
    // Fără reload — vine direct din răspunsul POST-ului, prepend-uit în istoric.
    expect(await within(dialog).findByText("Vrea reprogramare joi")).toBeInTheDocument();
  });
});

describe("CRM (Faza 1) — StageEditorDialog", () => {
  it("editorul de etape refuză ștergerea unei etape cu lead-uri, cu mesaj explicit", async () => {
    const customStages: CrmStage[] = [
      ...DEFAULT_STAGES,
      {
        id: "custom-1",
        key: "negociere",
        label: "Negociere",
        color: "peach",
        orderIndex: 5,
        isWon: false,
        isLost: false,
        isDefault: false,
        probabilityPct: 40,
      },
    ];
    getCrmPipeline.mockResolvedValue(
      makePipeline([makeLead({ id: "l1", fullName: "Maria Popescu", stage: "new" })], customStages)
    );
    deleteCrmStage.mockRejectedValue(
      new ApiError(409, "stage_not_empty", undefined, [], { error: "stage_not_empty", leads: 3 })
    );

    render(<CrmPipelinePage />);
    await screen.findAllByText("Maria Popescu");

    fireEvent.click(screen.getByRole("button", { name: "Etape" }));
    const dialog = await screen.findByRole("dialog", { name: "Etape pipeline" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Șterge etapa Negociere" }));

    await waitFor(() => expect(deleteCrmStage).toHaveBeenCalled());
    expect(await screen.findByText("Etapa conține 3 lead-uri. Mută-le întâi.")).toBeInTheDocument();
  });
});

describe("CRM (Faza 1) — CrmProductsPage", () => {
  it("lista de produse afișează prețul în moneda produsului", async () => {
    listCrmProducts.mockResolvedValue({
      items: [
        makeProduct({ id: "p1", name: "Curs Engleză", currency: "MDL", listPriceCents: 150000 }),
        makeProduct({ id: "p2", name: "Curs Premium", currency: "EUR", listPriceCents: 9900 }),
      ],
    });

    render(<CrmProductsPage />);

    await screen.findByText("Curs Engleză");
    expect(screen.getByText("1.500,00 L")).toBeInTheDocument(); // MDL — simbolul nativ „L”
    expect(screen.getByText("99,00 EUR")).toBeInTheDocument();
  });
});
