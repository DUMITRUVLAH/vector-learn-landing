/**
 * CRM — filtrele TABLEI se aplică pe server, nu în browser.
 *
 * Bug-ul pe care îl închid testele astea: kanbanul cernea local cele 50 de carduri încărcate pe
 * coloană. Pe o bază de 3.200 de leaduri, o căutare după un client care EXISTĂ întorcea „niciun
 * rezultat" (clientul nu era printre cardurile aduse), iar numărătorile de pe coloane arătau
 * altceva decât vederea listă, cu exact aceleași filtre pe ecran.
 *
 * Ce se verifică: fiecare filtru pleacă la server, căutarea e temperată (debounce, ca în listă),
 * iar cifrele afișate sunt cele ale SERVERULUI, nu ale cardurilor încărcate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
  // Catalogul de produse: fișa îl cere pentru select-ul „Produs".
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

/** Răspuns în care serverul raportează MAI MULTE leaduri decât cardurile trimise. */
function makeCappedResponse(cardCount: number, serverCount: number): CrmPipelineResponse {
  const cards = Array.from({ length: cardCount }, (_, i) =>
    makeLead({ id: `lead-${i}`, fullName: `Client ${i}` })
  );
  return {
    grouped: { new: cards, paid: [] },
    counts: { new: serverCount, paid: 4 },
    valueSums: { new: 500_00, paid: 0 },
    totalValueCents: 500_00,
    stages: STAGES,
    pipelines: [VANZARI],
    pipelineId: VANZARI.id,
  };
}

describe("Filtrele tablei pleacă la server", () => {
  beforeEach(() => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI], VANZARI.id, [makeLead({ fullName: "Maria Popescu" })]));
  });

  it("[blocant] căutarea ajunge în cererea către server, nu doar în browser", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.change(screen.getByPlaceholderText(/Caută nume, telefon/), { target: { value: "ana" } });

    await waitFor(() =>
      expect(getCrmPipeline).toHaveBeenLastCalledWith(VANZARI.id, expect.objectContaining({ search: "ana" }))
    );
  });

  it("[blocant] tastarea rapidă produce O SINGURĂ cerere (debounce), nu una pe literă", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");
    const cereriInainte = getCrmPipeline.mock.calls.length;

    const input = screen.getByPlaceholderText(/Caută nume, telefon/);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "an" } });
    fireEvent.change(input, { target: { value: "ana" } });

    await waitFor(() =>
      expect(getCrmPipeline).toHaveBeenLastCalledWith(VANZARI.id, expect.objectContaining({ search: "ana" }))
    );
    expect(getCrmPipeline.mock.calls.length).toBe(cereriInainte + 1);
  });

  it("[blocant] sursa și „Doar ale mele” pleacă tot la server", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.change(screen.getByLabelText("Filtrează după sursă"), { target: { value: "facebook_ad" } });
    await waitFor(() =>
      expect(getCrmPipeline).toHaveBeenLastCalledWith(VANZARI.id, expect.objectContaining({ source: "facebook_ad" }))
    );

    fireEvent.click(screen.getByLabelText("Arată doar leadurile mele"));
    await waitFor(() =>
      expect(getCrmPipeline).toHaveBeenLastCalledWith(VANZARI.id, expect.objectContaining({ assignedTo: "user-1" }))
    );
  });

  it("[blocant] un filtru fără rezultate spune „niciun rezultat”, nu „niciun lead încă”", async () => {
    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    getCrmPipeline.mockResolvedValue({
      grouped: { new: [], paid: [] },
      counts: { new: 0, paid: 0 },
      valueSums: {},
      totalValueCents: 0,
      stages: STAGES,
      pipelines: [VANZARI],
      pipelineId: VANZARI.id,
      segmented: true,
    });
    fireEvent.change(screen.getByPlaceholderText(/Caută nume, telefon/), { target: { value: "zzz" } });

    // Starea goală „Adaugă primul lead" ar fi o minciună: baza are leaduri, filtrul n-are potrivire.
    await waitFor(() => expect(screen.queryByText("Niciun lead încă")).not.toBeInTheDocument());
    expect(screen.getAllByText(/Niciun rezultat/).length).toBeGreaterThan(0);
  });
});

describe("Cifrele afișate sunt ale serverului, nu ale cardurilor încărcate", () => {
  it("[blocant] coloana arată contorul serverului chiar când s-au trimis mai puține carduri", async () => {
    // Serverul plafonează la 50 de carduri pe coloană, dar raportează 320 în etapă.
    getCrmPipeline.mockResolvedValue(makeCappedResponse(2, 320));

    render(<CrmPipelinePage />);
    await findLeadCards("Client 0");

    // 320 apare pe antetul coloanei (desktop + mobil), nu „2".
    expect(screen.getAllByText("320").length).toBeGreaterThan(0);
  });

  it("[blocant] antetul paginii numără din contoarele serverului, nu din cardurile primite", async () => {
    getCrmPipeline.mockResolvedValue(makeCappedResponse(2, 320));

    render(<CrmPipelinePage />);
    await findLeadCards("Client 0");

    // 320 în „new" + 4 în „paid" (etapă câștigată) = 324 leaduri, conversie 1%.
    expect(await screen.findByText(/324 leaduri/)).toBeInTheDocument();
    expect(screen.getByText(/conversie 1%/)).toBeInTheDocument();
  });
});
