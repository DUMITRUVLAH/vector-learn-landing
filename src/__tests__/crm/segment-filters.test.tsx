/**
 * CRM — bara de segmentare (cerința 4 din caietul de sarcini), partea de interfață.
 *
 * Ce apără testele astea, în ordinea importanței:
 *  1. **filtrul activ rămâne vizibil** — cineva care a filtrat ieri deschide azi tabla și vede
 *     12 leaduri în loc de 300; fără etichetele de segment ar crede că a pierdut baza;
 *  2. opțiunile vin de la server (industriile CHIAR introduse), nu dintr-un nomenclator fix;
 *  3. lista cere serverului aceleași filtre ca tabla — altfel aceleași butoane ar însemna două
 *     lucruri diferite în cele două vederi ale aceluiași ecran.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmLead, CrmLeadListResponse, CrmSegmentFilters, CrmSegmentOptions, CrmStage } from "@/lib/api/crm";

const getCrmSegmentOptions = vi.fn();
const listCrmLeads = vi.fn();

vi.mock("@/lib/api/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crm")>("@/lib/api/crm");
  return {
    ...actual,
    getCrmSegmentOptions: () => getCrmSegmentOptions(),
    listCrmLeads: (...args: unknown[]) => listCrmLeads(...args),
  };
});

const { SegmentFilterBar } = await import("@/components/crm/SegmentFilterBar");
const { LeadListView } = await import("@/components/crm/LeadListView");

const OPTIONS: CrmSegmentOptions = {
  industries: ["HoReCa", "Industrie alimentară"],
  regions: ["Centru", "Nord"],
  sizes: ["1-10", "51-250"],
  products: [{ id: "prod-1", name: "Panouri 10 kW" }],
  consumption: { min: 9000, max: 900000 },
};

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
];

function makeLead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    id: "lead-1",
    fullName: "Fabrica de Zahăr",
    dealName: null,
    phone: null,
    email: null,
    company: "Fabrica de Zahăr SRL",
    interestCourse: null,
    source: "manual",
    stage: "new",
    valueCents: 0,
    assignedTo: null,
    lostReason: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeList(items: CrmLead[]): CrmLeadListResponse {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCrmSegmentOptions.mockResolvedValue(OPTIONS);
  listCrmLeads.mockResolvedValue(makeList([makeLead()]));
});

describe("Bara de segmentare", () => {
  it("[blocant] opțiunile vin de la server, nu dintr-un nomenclator fix", async () => {
    render(<SegmentFilterBar value={{}} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Segmentare/ }));

    await waitFor(() => expect(getCrmSegmentOptions).toHaveBeenCalled());
    const industrie = await screen.findByLabelText("Industrie");
    expect(screen.getByRole("option", { name: "Industrie alimentară" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "HoReCa" })).toBeInTheDocument();
    // Selectul are și „toate" — un filtru trebuie să se poată scoate din locul din care s-a pus.
    expect((industrie as HTMLSelectElement).value).toBe("all");
  });

  it("[blocant] alegerea unei industrii ridică filtrul în sus, curățat", async () => {
    const onChange = vi.fn();
    render(<SegmentFilterBar value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Segmentare/ }));

    const industrie = await screen.findByLabelText("Industrie");
    fireEvent.change(industrie, { target: { value: "HoReCa" } });

    expect(onChange).toHaveBeenCalledWith({ industry: "HoReCa" });
  });

  it("[blocant] filtrele active se văd ca etichete CHIAR cu panoul închis", async () => {
    const value: CrmSegmentFilters = { industry: "HoReCa", minConsumptionKwh: 100000 };
    render(<SegmentFilterBar value={value} onChange={vi.fn()} />);

    // Panoul e închis (nu s-a apăsat nimic), dar filtrul nu e invizibil.
    expect(screen.getByText("Industrie: HoReCa")).toBeInTheDocument();
    expect(screen.getByText("Consum ≥ 100 MWh")).toBeInTheDocument();
    // Și insigna spune câte filtre sunt active.
    expect(screen.getByRole("button", { name: /Segmentare/ })).toHaveTextContent("2");
  });

  it("[blocant] „×\" pe o etichetă scoate DOAR filtrul ei", () => {
    const onChange = vi.fn();
    render(<SegmentFilterBar value={{ industry: "HoReCa", region: "Nord" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Scoate filtrul Industrie: HoReCa/ }));
    expect(onChange).toHaveBeenCalledWith({ region: "Nord" });
  });

  it("[normal] „Golește segmentul\" le scoate pe toate deodată", () => {
    const onChange = vi.fn();
    render(<SegmentFilterBar value={{ industry: "HoReCa", region: "Nord" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Golește segmentul/ }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("[normal] baza fără firmografie spune ce lipsește, nu arată select-uri goale", async () => {
    getCrmSegmentOptions.mockResolvedValue({
      industries: [],
      regions: [],
      sizes: [],
      products: [],
      consumption: null,
    });
    render(<SegmentFilterBar value={{}} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Segmentare/ }));

    expect(await screen.findByText(/Nicio firmă din bază n-are încă/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Industrie")).not.toBeInTheDocument();
  });
});

describe("Lista de leaduri cu segment", () => {
  it("[blocant] trimite segmentul SERVERULUI, împreună cu restul filtrelor", async () => {
    render(
      <LeadListView
        pipelineId="pipe-1"
        stages={STAGES}
        search=""
        source="all"
        assignedTo={null}
        segments={{ industry: "Industrie alimentară", minConsumptionKwh: 100000 }}
        memberNames={{}}
        onOpenLead={vi.fn()}
      />
    );

    await waitFor(() => expect(listCrmLeads).toHaveBeenCalled());
    expect(listCrmLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineId: "pipe-1",
        industry: "Industrie alimentară",
        minConsumptionKwh: 100000,
      })
    );
  });

  it("[blocant] schimbarea segmentului recere pagina 1, nu pagina pe care erai", async () => {
    const { rerender } = render(
      <LeadListView
        pipelineId="pipe-1"
        stages={STAGES}
        search=""
        source="all"
        assignedTo={null}
        segments={{}}
        memberNames={{}}
        onOpenLead={vi.fn()}
      />
    );
    await waitFor(() => expect(listCrmLeads).toHaveBeenCalled());
    listCrmLeads.mockClear();

    rerender(
      <LeadListView
        pipelineId="pipe-1"
        stages={STAGES}
        search=""
        source="all"
        assignedTo={null}
        segments={{ region: "Nord" }}
        memberNames={{}}
        onOpenLead={vi.fn()}
      />
    );

    await waitFor(() => expect(listCrmLeads).toHaveBeenCalled());
    expect(listCrmLeads).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, region: "Nord" }));
  });

  it("[normal] un obiect de segment nou la fiecare render NU reîncarcă la nesfârșit", async () => {
    const props = {
      pipelineId: "pipe-1",
      stages: STAGES,
      search: "",
      source: "all",
      assignedTo: null,
      memberNames: {},
      onOpenLead: vi.fn(),
    };
    // Părintele recreează obiectul la fiecare render (exact ce face `CrmPipelinePage`).
    const { rerender } = render(<LeadListView {...props} segments={{ region: "Nord" }} />);
    await waitFor(() => expect(listCrmLeads).toHaveBeenCalledTimes(1));

    rerender(<LeadListView {...props} segments={{ region: "Nord" }} />);
    rerender(<LeadListView {...props} segments={{ region: "Nord" }} />);

    await new Promise((r) => setTimeout(r, 30));
    expect(listCrmLeads).toHaveBeenCalledTimes(1);
  });
});
