/**
 * CRM (Faza 1) — smoke tests de UI pentru lansator, kanban și produse.
 * Mock-uri după modelul din `src/__tests__/docmerge/docmerge-001-ui.test.tsx`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmLead, CrmPipelineResponse, CrmProduct } from "@/lib/api/crm";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Test Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
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
const listCrmProducts = vi.fn();
const createCrmProduct = vi.fn();
const updateCrmProduct = vi.fn();
const archiveCrmProduct = vi.fn();
const restoreCrmProduct = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  getCrmPipeline: (...args: unknown[]) => getCrmPipeline(...args),
  createCrmLead: (...args: unknown[]) => createCrmLead(...args),
  moveCrmLeadStage: (...args: unknown[]) => moveCrmLeadStage(...args),
  listCrmProducts: (...args: unknown[]) => listCrmProducts(...args),
  createCrmProduct: (...args: unknown[]) => createCrmProduct(...args),
  updateCrmProduct: (...args: unknown[]) => updateCrmProduct(...args),
  archiveCrmProduct: (...args: unknown[]) => archiveCrmProduct(...args),
  restoreCrmProduct: (...args: unknown[]) => restoreCrmProduct(...args),
}));

const { CrmHomePage } = await import("@/pages/business/crm/CrmHomePage");
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

function makePipeline(leads: CrmLead[]): CrmPipelineResponse {
  const grouped: Record<string, CrmLead[]> = { new: [], contacted: [], trial: [], paid: [], lost: [] };
  const counts: Record<string, number> = { new: 0, contacted: 0, trial: 0, paid: 0, lost: 0 };
  for (const lead of leads) {
    grouped[lead.stage] = [...(grouped[lead.stage] ?? []), lead];
    counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
  }
  return { grouped, counts, valueSums: {}, totalValueCents: 0 };
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

describe("CRM (Faza 1) — CrmHomePage", () => {
  it("pagina CRM arată Pipeline și Produse ca active", () => {
    render(<CrmHomePage />);

    // Tile-urile active sunt randate ca `<Link>` (tag `<a>`), cu `role="listitem"` pentru grila
    // „Module CRM" — la fel ca în `FinHome.tsx`, sursa de adevăr pentru acest pattern.
    const pipeline = screen.getByRole("listitem", { name: /Accesează Pipeline/i });
    expect(pipeline.tagName).toBe("A");
    expect(pipeline).toHaveAttribute("href", "#/business/crm/pipeline");

    const produse = screen.getByRole("listitem", { name: /Accesează Produse/i });
    expect(produse.tagName).toBe("A");
    expect(produse).toHaveAttribute("href", "#/business/crm/produse");
  });

  it("submodulele neterminate apar ca „În curând” și NU sunt linkuri", () => {
    render(<CrmHomePage />);

    // Tile-urile blocate sunt `<div>`-uri mute, fără tag `<a>`.
    const astazi = screen.getByLabelText(/Astăzi — în curând/i);
    expect(astazi.tagName).toBe("DIV");
    const rapoarte = screen.getByLabelText(/Rapoarte — în curând/i);
    expect(rapoarte.tagName).toBe("DIV");

    // Dar tile-ul e vizibil, marcat explicit „în curând”.
    expect(screen.getByLabelText(/Astăzi — în curând/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Clienți & companii — în curând/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Comunicare — în curând/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Automatizări — în curând/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rapoarte — în curând/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Documente — în curând/i)).toBeInTheDocument();
    expect(screen.getAllByText("În curând").length).toBeGreaterThanOrEqual(6);
  });
});

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

    // 2 leaduri, 1 convertit (paid) → conversie 50%, arătat în antetul paginii.
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

    fireEvent.click(screen.getByText("Nu răspunde"));
    fireEvent.click(screen.getByRole("button", { name: /Marchează pierdut/i }));

    await waitFor(() => {
      expect(moveCrmLeadStage).toHaveBeenCalledWith("l1", { stage: "lost", lostReason: "Nu răspunde" });
    });
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
