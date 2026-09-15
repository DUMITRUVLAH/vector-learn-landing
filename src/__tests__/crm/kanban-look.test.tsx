/**
 * CRM — ce se VEDE pe tabla de leaduri.
 *
 * Trei lucruri pe care tabla le spunea prost și care se repară aici:
 *  1. pâlniile stăteau într-un `<select>` pierdut printre butoanele din colț — un workspace cu
 *     patru linii de business nu știa că le are, deci pâlniile construite rămâneau nefolosite;
 *  2. antetul spunea „N leaduri · conversie X%”, adică tot ce se poate ști fără să deschizi nimic;
 *     un director are nevoie de forecastul PONDERAT, cifra pe care o poate pune într-un buget;
 *  3. cardurile nu purtau niciun semnal de lucru: patruzeci de cartonașe identice, iar restanțele
 *     se aflau deschizând fișă cu fișă.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/** Pagina randează tabla de două ori (desktop + mobil), deci fiecare card apare de două ori. */
async function findLeadCards(name: string) {
  return screen.findAllByText(name);
}
import type { CrmLead, CrmPipeline, CrmPipelineResponse, CrmStage } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

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

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    members: [{ id: "user-1", fullName: "Test Admin", email: "admin@test.local", role: "owner" }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/pipeline", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const getCrmPipeline = vi.fn();
const createCrmLead = vi.fn();
const moveCrmLeadStage = vi.fn();
const createCrmPipeline = vi.fn();
const renameCrmPipeline = vi.fn();
const deleteCrmPipeline = vi.fn();
const listCrmLostReasons = vi.fn().mockResolvedValue({ items: [] });
const listCrmLeads = vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });

vi.mock("@/lib/api/crm", () => ({
  // Catalogul de produse: fișa îl cere pentru select-ul „Produs”.
  listCrmProducts: vi.fn().mockResolvedValue({ items: [] }),
  // Drepturile utilizatorului: ecranele CRM le cer ca să știe ce butoane să arate.
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["leads.view_all", "leads.edit", "pipelines.manage", "products.manage", "cadences.manage", "automations.manage", "assignment.manage", "audit.view"] }),
  getCrmPipeline: (...args: unknown[]) => getCrmPipeline(...args),
  createCrmLead: (...args: unknown[]) => createCrmLead(...args),
  moveCrmLeadStage: (...args: unknown[]) => moveCrmLeadStage(...args),
  createCrmPipeline: (...args: unknown[]) => createCrmPipeline(...args),
  renameCrmPipeline: (...args: unknown[]) => renameCrmPipeline(...args),
  deleteCrmPipeline: (...args: unknown[]) => deleteCrmPipeline(...args),
  listCrmLostReasons: (...args: unknown[]) => listCrmLostReasons(...args),
  listCrmLeads: (...args: unknown[]) => listCrmLeads(...args),
  // Fișa leadului nu se deschide în testele de mai jos; export-urile ei rămân inerte.
  getCrmLeadDetail: vi.fn(),
  updateCrmLead: vi.fn(),
  createCrmLeadInteraction: vi.fn(),
  createCrmStage: vi.fn(),
  updateCrmStage: vi.fn(),
  deleteCrmStage: vi.fn(),
  reorderCrmStages: vi.fn(),
  listCrmLeadTasks: vi.fn().mockResolvedValue({ items: [] }),
  createCrmLeadTask: vi.fn(),
  completeCrmLeadTask: vi.fn(),
  reopenCrmLeadTask: vi.fn(),
  snoozeCrmLeadTask: vi.fn(),
  deleteCrmLeadTask: vi.fn(),
  listCrmLeadTags: vi.fn().mockResolvedValue({ items: [] }),
  addCrmLeadTag: vi.fn(),
  removeCrmLeadTag: vi.fn(),
  listCrmTagSuggestions: vi.fn().mockResolvedValue({ items: [] }),
  moveCrmLeadPipeline: vi.fn(),
  listCrmSavedViews: vi.fn().mockResolvedValue({ items: [] }),
  listCrmUpcomingTasks: vi.fn().mockResolvedValue({ items: [] }),
  createCrmSavedView: vi.fn(),
  deleteCrmSavedView: vi.fn(),
}));

const { CrmPipelinePage } = await import("@/pages/business/crm/CrmPipelinePage");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "s2", key: "paid", label: "Client", color: "mint", orderIndex: 1, isWon: true, isLost: false, isDefault: true, probabilityPct: 100 },
];

const VANZARI: CrmPipeline = {
  id: "pipe-vanzari",
  name: "Vânzări",
  orderIndex: 0,
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const B2B: CrmPipeline = {
  id: "pipe-b2b",
  name: "B2B",
  orderIndex: 1,
  isDefault: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeLead(overrides: Partial<CrmLead>): CrmLead {
  return {
    id: "lead-1",
    fullName: "Maria Popescu",
    dealName: null,
    phone: null,
    email: null,
    company: null,
    interestCourse: null,
    source: "manual",
    stage: "new",
    valueCents: 0,
    assignedTo: null,
    lostReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeResponse(
  pipelines: CrmPipeline[],
  pipelineId: string,
  leads: CrmLead[]
): CrmPipelineResponse {
  const grouped: Record<string, CrmLead[]> = { new: [], paid: [] };
  for (const l of leads) grouped[l.stage] = [...(grouped[l.stage] ?? []), l];
  return {
    grouped,
    counts: { new: grouped.new.length, paid: grouped.paid.length },
    valueSums: {},
    totalValueCents: 0,
    stages: STAGES,
    pipelines,
    pipelineId,
  };
}

// ─── Teste ────────────────────────────────────────────────────────────────────

/** Tablă cu două etape, valori și probabilități — de aici iese forecastul ponderat. */
function boardWithValues(): CrmPipelineResponse {
  return {
    grouped: {
      new: [makeLead({ id: "l1", fullName: "Alfa Logistic SRL", valueCents: 100_000, interestCourse: "Training AI in-house" })],
      paid: [makeLead({ id: "l2", fullName: "Nord Agro SRL", stage: "paid", valueCents: 50_000 })],
    },
    counts: { new: 1, paid: 1 },
    // 1.000,00 lei în „Lead nou” (10%) + 500,00 lei în „Client” (câștigat, 100%) = 600,00 lei.
    valueSums: { new: 100_000, paid: 50_000 },
    totalValueCents: 150_000,
    stages: STAGES,
    pipelines: [VANZARI, B2B],
    pipelineId: VANZARI.id,
  };
}

describe("Pâlniile se văd ca pastile, nu ascunse într-un select", () => {
  beforeEach(() => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI, B2B], VANZARI.id, [makeLead({ fullName: "Maria Popescu" })]));
  });

  it("[blocant] fiecare pâlnie are pastila ei, iar cea afișată e marcată", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    const vanzari = screen.getByRole("button", { name: "Vânzări" });
    const b2b = screen.getByRole("button", { name: "B2B" });
    expect(vanzari).toHaveAttribute("aria-pressed", "true");
    expect(b2b).toHaveAttribute("aria-pressed", "false");
  });

  it("[blocant] click pe pastilă cere serverului ACEA pâlnie", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.click(screen.getByRole("button", { name: "B2B" }));
    await waitFor(() => expect(getCrmPipeline).toHaveBeenLastCalledWith(B2B.id, expect.any(Object)));
  });

  it("[normal] „Pâlnie nouă” stă lângă pastile, nu într-un meniu", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");
    expect(screen.getByRole("button", { name: /Pâlnie nouă/ })).toBeInTheDocument();
  });
});

describe("Antetul spune forecastul ponderat", () => {
  it("[blocant] ponderează valoarea fiecărei etape cu probabilitatea ei", async () => {
    getCrmPipeline.mockResolvedValue(boardWithValues());
    render(<CrmPipelinePage />);
    await findLeadCards("Alfa Logistic SRL");

    // 1.000,00 × 10% + 500,00 × 100% = 600,00 lei.
    expect(await screen.findByText(/Forecast ponderat: 600,00/)).toBeInTheDocument();
  });

  it("[blocant] etapele „pierdut” NU intră în forecast — altfel prognoza crește când pierzi", async () => {
    const lostStage: CrmStage = { id: "s3", key: "lost", label: "Pierdut", color: "rose", orderIndex: 2, isWon: false, isLost: true, isDefault: true, probabilityPct: 0 };
    getCrmPipeline.mockResolvedValue({
      ...boardWithValues(),
      grouped: { new: [makeLead({ id: "l1", fullName: "Alfa Logistic SRL", valueCents: 100_000 })], paid: [], lost: [] },
      counts: { new: 1, paid: 0, lost: 3 },
      valueSums: { new: 100_000, paid: 0, lost: 900_000 },
      stages: [...STAGES, lostStage],
    });
    render(<CrmPipelinePage />);
    await findLeadCards("Alfa Logistic SRL");

    // Doar 1.000,00 × 10% = 100,00 lei; cele 9.000 de lei pierdute nu apar nicăieri în prognoză.
    expect(await screen.findByText(/Forecast ponderat: 100,00/)).toBeInTheDocument();
  });
});

describe("Cardul poartă semnalul de lucru", () => {
  it("[blocant] taskul deschis apare pe card, cu data lui", async () => {
    getCrmPipeline.mockResolvedValue({
      ...boardWithValues(),
      grouped: {
        new: [makeLead({ id: "l1", fullName: "Alfa Logistic SRL", nextTask: { title: "Sună directorul", dueAt: "2030-01-15T09:00:00.000Z" } })],
        paid: [],
      },
    });
    render(<CrmPipelinePage />);
    await findLeadCards("Alfa Logistic SRL");

    expect(screen.getAllByText(/Sună directorul/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/15\.01/).length).toBeGreaterThan(0);
  });

  it("[blocant] un task cu scadența trecută se vede ca restanță, nu ca notă oarecare", async () => {
    getCrmPipeline.mockResolvedValue({
      ...boardWithValues(),
      grouped: {
        new: [makeLead({ id: "l1", fullName: "Alfa Logistic SRL", nextTask: { title: "Trimite oferta", dueAt: "2020-01-15T09:00:00.000Z" } })],
        paid: [],
      },
    });
    const { container } = render(<CrmPipelinePage />);
    await findLeadCards("Alfa Logistic SRL");

    // Dunga roșie din stânga cardului e semnalul care se vede fără să citești nimic.
    expect(container.querySelectorAll(".border-l-destructive").length).toBeGreaterThan(0);
  });

  it("[normal] fără task, cardul nu inventează niciun semnal", async () => {
    getCrmPipeline.mockResolvedValue(boardWithValues());
    const { container } = render(<CrmPipelinePage />);
    await findLeadCards("Alfa Logistic SRL");

    expect(container.querySelectorAll(".border-l-destructive").length).toBe(0);
  });
});

describe("Sub-navigarea modulului", () => {
  it("[blocant] toate ecranele CRM sunt la un click, iar cel curent e marcat", async () => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI], VANZARI.id, [makeLead({ fullName: "Maria Popescu" })]));
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    const nav = screen.getByRole("navigation", { name: "Secțiunile modulului CRM" });
    for (const label of ["Pipeline", "Astăzi", "Clienți", "Produse", "Documente", "Rapoarte"]) {
      expect(nav).toHaveTextContent(label);
    }
    // Căutarea se face ÎN bară: „Pipeline" apare și în meniul lateral al aplicației.
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
  });
});
