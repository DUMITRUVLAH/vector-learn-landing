/**
 * CRM — acțiuni în masă din vederea LISTĂ (cerințele 5–6), partea de interfață.
 *
 * Ce apără testele:
 *  1. selecția e pe pagina curentă și o SPUNE — o selecție care pretinde că acoperă tot segmentul
 *     ar lăsa sute de leaduri neatinse fără ca nimeni să afle;
 *  2. rezultatul parțial ajunge la om în cuvinte, nu în coduri („3 nu au etapa asta în pâlnia lor");
 *  3. „pierdut" cere motiv și în masă — butonul rămâne blocat până există unul;
 *  4. schimbarea paginii golește selecția: altfel acțiunea ar atinge leaduri ieșite de pe ecran.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmLead, CrmLeadListResponse, CrmStage } from "@/lib/api/crm";

const listCrmLeads = vi.fn();
const bulkCrmLeads = vi.fn();

vi.mock("@/lib/api/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crm")>("@/lib/api/crm");
  return {
    ...actual,
    listCrmLeads: (...args: unknown[]) => listCrmLeads(...args),
    bulkCrmLeads: (...args: unknown[]) => bulkCrmLeads(...args),
  };
});

const { LeadListView } = await import("@/components/crm/LeadListView");
const { summarizeBulk } = await import("@/components/crm/LeadBulkBar");

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "s2", key: "contacted", label: "Contactat", color: "amber", orderIndex: 1, isWon: false, isLost: false, isDefault: false, probabilityPct: 30 },
  { id: "s3", key: "pierdut", label: "Pierdut", color: "rose", orderIndex: 2, isWon: false, isLost: true, isDefault: false, probabilityPct: 0 },
];

const MEMBERS = [
  { id: "user-1", fullName: "Ana Ionescu" },
  { id: "user-2", fullName: "Ion Rusu" },
];

function makeLead(id: string, fullName: string): CrmLead {
  return {
    id,
    fullName,
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
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
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
      memberNames={{}}
      members={MEMBERS}
      canBulkEdit
      onOpenLead={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listCrmLeads.mockResolvedValue(makeList([makeLead("l1", "Fabrica"), makeLead("l2", "Pensiunea")]));
  bulkCrmLeads.mockResolvedValue({ updated: 2, skipped: [] });
});

describe("Selecția multiplă în listă", () => {
  it("[blocant] bara apare abia după o selecție și spune că e DOAR pagina curentă", async () => {
    renderList();
    await screen.findByText("Fabrica");
    expect(screen.queryByRole("region", { name: "Acțiuni în masă" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Selectează Fabrica"));

    expect(screen.getByRole("region", { name: "Acțiuni în masă" })).toBeInTheDocument();
    expect(screen.getByText("1 selectat pe această pagină")).toBeInTheDocument();
  });

  it("[blocant] bifa din antet selectează exact leadurile de pe pagină", async () => {
    renderList();
    await screen.findByText("Fabrica");

    fireEvent.click(screen.getByLabelText("Selectează toate leadurile de pe această pagină"));
    expect(screen.getByText("2 selectate pe această pagină")).toBeInTheDocument();
  });

  it("[blocant] atribuirea trimite exact id-urile bifate", async () => {
    renderList();
    await screen.findByText("Fabrica");
    fireEvent.click(screen.getByLabelText("Selectează Fabrica"));

    fireEvent.change(screen.getByLabelText("Acțiune în masă"), { target: { value: "assign" } });
    fireEvent.change(screen.getByLabelText("Responsabil"), { target: { value: "user-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplică" }));

    await waitFor(() => expect(bulkCrmLeads).toHaveBeenCalled());
    expect(bulkCrmLeads).toHaveBeenCalledWith({ leadIds: ["l1"], action: "assign", assignedTo: "user-2" });
  });

  it("[blocant] „Pierdut” cere motiv — butonul stă blocat până există unul", async () => {
    renderList();
    await screen.findByText("Fabrica");
    fireEvent.click(screen.getByLabelText("Selectează Fabrica"));

    fireEvent.change(screen.getByLabelText("Acțiune în masă"), { target: { value: "stage" } });
    fireEvent.change(screen.getByLabelText("Etapă țintă"), { target: { value: "pierdut" } });

    const aplica = screen.getByRole("button", { name: "Aplică" });
    expect(aplica).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivul pierderii (obligatoriu)"), {
      target: { value: "preț prea mare" },
    });
    expect(aplica).not.toBeDisabled();

    fireEvent.click(aplica);
    await waitFor(() => expect(bulkCrmLeads).toHaveBeenCalled());
    expect(bulkCrmLeads).toHaveBeenCalledWith({
      leadIds: ["l1"],
      action: "stage",
      stage: "pierdut",
      lostReason: "preț prea mare",
    });
  });

  it("[blocant] rezultatul parțial ajunge la om, nu e înghițit", async () => {
    const onToast = vi.fn();
    bulkCrmLeads.mockResolvedValue({
      updated: 1,
      skipped: [
        { leadId: "l2", reason: "unknown_stage" },
        { leadId: "l3", reason: "unknown_stage" },
      ],
    });
    renderList({ onToast });
    await screen.findByText("Fabrica");
    fireEvent.click(screen.getByLabelText("Selectează toate leadurile de pe această pagină"));
    fireEvent.change(screen.getByLabelText("Acțiune în masă"), { target: { value: "stage" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplică" }));

    await waitFor(() => expect(onToast).toHaveBeenCalled());
    expect(onToast.mock.calls[0][0].message).toBe("1 lead actualizat · 2 nu au etapa asta în pâlnia lor");
  });

  it("[blocant] după aplicare, selecția se golește și lista se recere", async () => {
    const onBulkDone = vi.fn();
    renderList({ onBulkDone });
    await screen.findByText("Fabrica");
    fireEvent.click(screen.getByLabelText("Selectează Fabrica"));
    listCrmLeads.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Aplică" }));

    await waitFor(() => expect(onBulkDone).toHaveBeenCalled());
    expect(listCrmLeads).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Acțiuni în masă" })).not.toBeInTheDocument()
    );
  });

  it("[blocant] fără dreptul de editare nu există nici bifă, nici bară", async () => {
    renderList({ canBulkEdit: false });
    await screen.findByText("Fabrica");
    expect(screen.queryByLabelText("Selectează Fabrica")).not.toBeInTheDocument();
  });
});

describe("Rezumatul unei acțiuni în masă", () => {
  it("[normal] numără motivele, nu le înșiră lead cu lead", () => {
    const text = summarizeBulk({
      updated: 12,
      skipped: [
        { leadId: "a", reason: "already_assigned" },
        { leadId: "b", reason: "already_assigned" },
        { leadId: "c", reason: "not_found" },
      ],
    });
    expect(text).toBe("12 leaduri actualizate · 2 aveau deja responsabil · 1 nu mai există");
  });
});
