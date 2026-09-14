/**
 * CRM Faza 9 — pâlnii MULTIPLE pe tabla de leaduri.
 *
 * Portare din crm-vector (`PipelineManagerModal` + selectorul din `Leads.tsx`). Aici se verifică
 * ACȚIUNEA din interfață: tabla cere serverului pâlnia aleasă, leadul nou se naște în pâlnia
 * afișată, iar implicita nu primește buton de ștergere (serverul o refuză oricum — un buton care
 * nu poate reuși e o promisiune falsă).
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
  useTeamMembers: () => ({ members: [], loading: false, error: null }),
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

vi.mock("@/lib/api/crm", () => ({
  getCrmPipeline: (...args: unknown[]) => getCrmPipeline(...args),
  createCrmLead: (...args: unknown[]) => createCrmLead(...args),
  moveCrmLeadStage: (...args: unknown[]) => moveCrmLeadStage(...args),
  createCrmPipeline: (...args: unknown[]) => createCrmPipeline(...args),
  renameCrmPipeline: (...args: unknown[]) => renameCrmPipeline(...args),
  deleteCrmPipeline: (...args: unknown[]) => deleteCrmPipeline(...args),
  listCrmLostReasons: (...args: unknown[]) => listCrmLostReasons(...args),
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

describe("Selectorul de pâlnie", () => {
  it("[blocant] comutarea pe „B2B” cere serverului EXACT acea pâlnie, nu tabla implicită", async () => {
    getCrmPipeline.mockImplementation(async (id?: string | null) =>
      id === B2B.id
        ? makeResponse([VANZARI, B2B], B2B.id, [makeLead({ id: "lead-2", fullName: "Corporate SRL" })])
        : makeResponse([VANZARI, B2B], VANZARI.id, [makeLead({ fullName: "Maria Popescu" })])
    );

    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.change(screen.getByLabelText("Pâlnie"), { target: { value: B2B.id } });

    await findLeadCards("Corporate SRL");
    expect(getCrmPipeline).toHaveBeenLastCalledWith(B2B.id);
    // Leadul celeilalte pâlnii dispare de pe tablă — nu rămâne amestecat.
    expect(screen.queryAllByText("Maria Popescu")).toHaveLength(0);
  });

  it("[normal] cu o singură pâlnie nu apare niciun selector — n-ai ce alege", async () => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI], VANZARI.id, [makeLead({})]));

    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    expect(screen.queryByLabelText("Pâlnie")).not.toBeInTheDocument();
  });
});

describe("Administrarea pâlniilor", () => {
  it("[blocant] pâlnia nouă se creează și devine cea afișată", async () => {
    getCrmPipeline.mockImplementation(async (id?: string | null) =>
      id === B2B.id
        ? makeResponse([VANZARI, B2B], B2B.id, [makeLead({ id: "lead-2", fullName: "Corporate SRL" })])
        : makeResponse([VANZARI], VANZARI.id, [makeLead({})])
    );
    createCrmPipeline.mockResolvedValue(B2B);

    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.click(screen.getByRole("button", { name: "Pâlnii" }));
    fireEvent.change(await screen.findByLabelText("Pâlnie nouă"), { target: { value: "B2B" } });
    fireEvent.click(screen.getByRole("button", { name: "Adaugă" }));

    await waitFor(() => expect(createCrmPipeline).toHaveBeenCalledWith("B2B"));
    await waitFor(() => expect(getCrmPipeline).toHaveBeenLastCalledWith(B2B.id));
  });

  it("[blocant] implicita nu are buton de ștergere, celelalte da", async () => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI, B2B], VANZARI.id, [makeLead({})]));

    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");
    fireEvent.click(screen.getByRole("button", { name: "Pâlnii" }));

    expect(await screen.findByRole("button", { name: "Șterge pâlnia B2B" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Șterge pâlnia Vânzări" })).not.toBeInTheDocument();
  });
});

describe("Leadul nou aparține pâlniei afișate", () => {
  it("[blocant] „Adaugă lead” trimite pipelineId-ul pâlniei curente", async () => {
    getCrmPipeline.mockResolvedValue(makeResponse([VANZARI, B2B], B2B.id, [makeLead({})]));
    createCrmLead.mockResolvedValue(makeLead({ id: "lead-nou" }));

    render(<CrmPipelinePage />);
    await findLeadCards("Maria Popescu");

    fireEvent.click(screen.getByRole("button", { name: /Adaugă lead/i }));
    fireEvent.change(await screen.findByLabelText(/^Nume/), { target: { value: "Client nou" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() =>
      expect(createCrmLead).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Client nou", pipelineId: B2B.id }))
    );
  });
});
