/**
 * CRM Faza 9 — vederea LISTĂ (alternativa la kanban).
 *
 * Portare din crm-vector (`Leads.tsx`, viewMode „list”). Se verifică exact ce face lista
 * diferit de kanban: cere serverului pagina afișată (nu filtrează 50 de carduri în browser),
 * sortează PE SERVER și paginează. O sortare locală ar ordona doar pagina curentă și ar minți
 * despre „cele mai valoroase leaduri” — de-aici testul pe parametrii cererii.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmLead, CrmLeadListResponse, CrmStage } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

const listCrmLeads = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  listCrmLeads: (...args: unknown[]) => listCrmLeads(...args),
}));

const { LeadListView } = await import("@/components/crm/LeadListView");

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
];

function makeLead(overrides: Partial<CrmLead>): CrmLead {
  return {
    id: "lead-1",
    fullName: "Maria Popescu",
    dealName: null,
    phone: "+37360000000",
    email: null,
    company: "Acme SRL",
    interestCourse: null,
    source: "manual",
    stage: "new",
    valueCents: 250000,
    assignedTo: "user-7",
    lostReason: null,
    createdAt: "2026-02-03T10:00:00.000Z",
    updatedAt: "2026-02-03T10:00:00.000Z",
    ...overrides,
  };
}

function makeList(items: CrmLead[], overrides: Partial<CrmLeadListResponse> = {}): CrmLeadListResponse {
  return { items, page: 1, pageSize: 20, total: items.length, totalPages: 1, ...overrides };
}

function renderList(props: Partial<React.ComponentProps<typeof LeadListView>> = {}) {
  return render(
    <LeadListView
      pipelineId="pipe-1"
      stages={STAGES}
      search=""
      source="all"
      assignedTo={null}
      memberNames={{ "user-7": "Ana Ionescu" }}
      onOpenLead={props.onOpenLead ?? vi.fn()}
      {...props}
    />
  );
}

describe("Lista de leaduri", () => {
  it("[blocant] cere serverului pâlnia și pagina — nu filtrează local", async () => {
    listCrmLeads.mockResolvedValue(makeList([makeLead({})]));

    renderList({ search: "  maria ", source: "referral", assignedTo: "user-7" });

    await screen.findByText("Maria Popescu");
    expect(listCrmLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineId: "pipe-1",
        page: 1,
        pageSize: 20,
        search: "maria", // fără spațiile de la capete
        source: "referral",
        assignedTo: "user-7",
        sort: "createdAt",
        dir: "desc",
      })
    );
  });

  it("[blocant] click pe „Valoare” schimbă sortarea PE SERVER, nu ordinea locală", async () => {
    listCrmLeads.mockResolvedValue(makeList([makeLead({}), makeLead({ id: "lead-2", fullName: "Ion Ureche" })]));

    renderList();
    await screen.findByText("Maria Popescu");

    fireEvent.click(screen.getByRole("button", { name: "Valoare" }));

    await waitFor(() =>
      expect(listCrmLeads).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "valueCents", dir: "desc", page: 1 })
      )
    );

    // Al doilea click inversează direcția, nu revine la implicit.
    fireEvent.click(screen.getByRole("button", { name: "Valoare" }));
    await waitFor(() =>
      expect(listCrmLeads).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "valueCents", dir: "asc" }))
    );
  });

  it("[blocant] paginarea cere pagina următoare, nu taie lista primită", async () => {
    listCrmLeads.mockResolvedValue(
      makeList([makeLead({})], { total: 57, totalPages: 3, page: 1, pageSize: 20 })
    );

    renderList();
    await screen.findByText("Maria Popescu");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("1–20 din 57")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pagina următoare" }));

    await waitFor(() => expect(listCrmLeads).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it("[normal] rândul arată responsabilul pe nume, nu pe id, și se deschide la click", async () => {
    const onOpenLead = vi.fn();
    listCrmLeads.mockResolvedValue(makeList([makeLead({})]));

    renderList({ onOpenLead });
    await screen.findByText("Maria Popescu");

    expect(screen.getByText("Ana Ionescu")).toBeInTheDocument();
    expect(screen.queryByText("user-7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Maria Popescu"));
    expect(onOpenLead).toHaveBeenCalledWith("lead-1");
  });

  it("[normal] lista goală spune ce să faci, iar paginarea rămâne accesibilă", async () => {
    listCrmLeads.mockResolvedValue(makeList([], { total: 0, totalPages: 1 }));

    renderList();

    expect(await screen.findByText(/Niciun lead găsit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagina anterioară" })).toBeInTheDocument();
  });
});
