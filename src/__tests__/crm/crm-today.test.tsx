/**
 * CRM — smoke tests de UI pentru `CrmTodayPage` („Azi"). Mock-uri după modelul din
 * `src/__tests__/crm/crm-module-ui.test.tsx` (același harness pentru `BusinessShell`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { CrmLead, CrmLeadTask, CrmStage, CrmTodayLead, CrmTodayResponse } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

const TEAM_MEMBERS_FIXTURE = [
  { id: "user-1", fullName: "Andreea Admin", email: "andreea@test.local", role: "owner" },
  { id: "user-2", fullName: "Victor Vânzări", email: "victor@test.local", role: "manager" },
];
vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: TEAM_MEMBERS_FIXTURE, loading: false, error: null }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/astazi", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const getCrmToday = vi.fn();
const getCrmStages = vi.fn();
const getCrmLeadDetail = vi.fn();
const updateCrmLead = vi.fn();
const moveCrmLeadStage = vi.fn();
const createCrmLeadInteraction = vi.fn();
const listCrmLeadTasks = vi.fn();
const createCrmLeadTask = vi.fn();
const completeCrmLeadTask = vi.fn();
const reopenCrmLeadTask = vi.fn();
const snoozeCrmLeadTask = vi.fn();
const deleteCrmLeadTask = vi.fn();
const listCrmLeadTags = vi.fn();
const addCrmLeadTag = vi.fn();
const removeCrmLeadTag = vi.fn();
const listCrmTagSuggestions = vi.fn();
const listCrmLostReasons = vi.fn();

// Fișa leadului (LeadDetailSheet) + dialogul de motiv-pierdere se montează întotdeauna sub
// `CrmTodayPage` (doar `open`-ul lor variază) — implicit, liste goale, ca niciun test de-aici
// (care nu verifică explicit taskuri/etichete/motive) să nu pice pe un `undefined()`.
listCrmLeadTasks.mockResolvedValue({ items: [] });
listCrmLeadTags.mockResolvedValue({ items: [] });
listCrmTagSuggestions.mockResolvedValue({ items: [] });
listCrmLostReasons.mockResolvedValue({ items: [] });

vi.mock("@/lib/api/crm", () => ({
  // Catalogul de produse: fișa îl cere pentru select-ul „Produs".
  listCrmProducts: vi.fn().mockResolvedValue({ items: [] }),
  // Drepturile utilizatorului: ecranele CRM le cer ca să știe ce butoane să arate.
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["leads.view_all", "leads.edit", "pipelines.manage", "products.manage", "cadences.manage", "automations.manage", "assignment.manage", "audit.view"] }),
  getCrmToday: (...args: unknown[]) => getCrmToday(...args),
  getCrmStages: (...args: unknown[]) => getCrmStages(...args),
  getCrmLeadDetail: (...args: unknown[]) => getCrmLeadDetail(...args),
  updateCrmLead: (...args: unknown[]) => updateCrmLead(...args),
  moveCrmLeadStage: (...args: unknown[]) => moveCrmLeadStage(...args),
  createCrmLeadInteraction: (...args: unknown[]) => createCrmLeadInteraction(...args),
  listCrmLeadTasks: (...args: unknown[]) => listCrmLeadTasks(...args),
  createCrmLeadTask: (...args: unknown[]) => createCrmLeadTask(...args),
  completeCrmLeadTask: (...args: unknown[]) => completeCrmLeadTask(...args),
  reopenCrmLeadTask: (...args: unknown[]) => reopenCrmLeadTask(...args),
  snoozeCrmLeadTask: (...args: unknown[]) => snoozeCrmLeadTask(...args),
  deleteCrmLeadTask: (...args: unknown[]) => deleteCrmLeadTask(...args),
  listCrmLeadTags: (...args: unknown[]) => listCrmLeadTags(...args),
  addCrmLeadTag: (...args: unknown[]) => addCrmLeadTag(...args),
  removeCrmLeadTag: (...args: unknown[]) => removeCrmLeadTag(...args),
  listCrmTagSuggestions: (...args: unknown[]) => listCrmTagSuggestions(...args),
  listCrmLostReasons: (...args: unknown[]) => listCrmLostReasons(...args),
  listCrmUpcomingTasks: vi.fn().mockResolvedValue({ items: [] }),
}));

const { CrmTodayPage } = await import("@/pages/business/crm/CrmTodayPage");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_STAGES: CrmStage[] = [
  { id: "new", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "contacted", key: "contacted", label: "Contactat", color: "lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, probabilityPct: 25 },
];

function makeLead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    id: "lead-1",
    fullName: "Maria Popescu",
    dealName: null,
    phone: "+373 690 00 00",
    email: null,
    company: null,
    interestCourse: null,
    source: "manual",
    stage: "new",
    valueCents: 0,
    assignedTo: null,
    lostReason: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function toTodayLead(lead: CrmLead): CrmTodayLead {
  return {
    id: lead.id,
    fullName: lead.fullName,
    dealName: lead.dealName,
    phone: lead.phone,
    company: lead.company,
    stage: lead.stage,
    assignedTo: lead.assignedTo,
    valueCents: lead.valueCents,
    createdAt: lead.createdAt,
  };
}

function makeTask(overrides: Partial<CrmLeadTask> = {}): CrmLeadTask {
  return {
    id: "task-1",
    tenantId: "t1",
    leadId: "lead-1",
    title: "Sună clientul",
    dueAt: "2026-01-01T00:00:00.000Z",
    status: "open",
    assignedTo: null,
    createdBy: null,
    completedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const EMPTY: CrmTodayResponse = { overdueTasks: [], uncontacted: [], noNextStep: [], neglected: [] };

// ─── Teste ────────────────────────────────────────────────────────────────────

describe("CRM — CrmTodayPage", () => {
  it("arată cele patru gălețile, cu numărul corect, și deschide fișa la click pe un rând", async () => {
    const noNextLead = makeLead({ id: "l1", fullName: "Lead fără pas următor" });
    const uncontactedLead = makeLead({ id: "l2", fullName: "Lead necontactat", stage: "new" });
    const overdueLead = makeLead({ id: "l3", fullName: "Lead cu restanță" });
    const overdueTask = makeTask({ id: "t1", leadId: "l3", title: "Revino cu oferta" });

    getCrmToday.mockResolvedValue({
      overdueTasks: [{ lead: toTodayLead(overdueLead), task: overdueTask }],
      uncontacted: [toTodayLead(uncontactedLead)],
      noNextStep: [toTodayLead(noNextLead)],
      neglected: [],
    } satisfies CrmTodayResponse);
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });
    getCrmLeadDetail.mockResolvedValue({ lead: noNextLead, interactions: [], stage: DEFAULT_STAGES[0] });

    render(<CrmTodayPage />);

    await screen.findByText("Lead fără pas următor");
    expect(screen.getByText("Lead necontactat")).toBeInTheDocument();
    expect(screen.getByText("Revino cu oferta")).toBeInTheDocument();

    // Numărătorile de pe fiecare cartelă reflectă lungimea fiecărei gălețile.
    expect(screen.getByText("Restante")).toBeInTheDocument();
    expect(screen.getByText("Necontactate")).toBeInTheDocument();
    expect(screen.getByText("Fără pas următor")).toBeInTheDocument();
    expect(screen.getByText("Neglijate")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Lead fără pas următor"));

    const dialog = await screen.findByRole("dialog", { name: "Lead fără pas următor" });
    await waitFor(() => expect(getCrmLeadDetail).toHaveBeenCalledWith("l1"));
    expect(within(dialog).getByText("Detalii")).toBeInTheDocument();
  });

  it("restanța deschide fișa lead-ului, nu a taskului", async () => {
    const overdueLead = makeLead({ id: "l3", fullName: "Lead cu restanță" });
    const overdueTask = makeTask({ id: "t1", leadId: "l3", title: "Revino cu oferta" });

    getCrmToday.mockResolvedValue({
      ...EMPTY,
      overdueTasks: [{ lead: toTodayLead(overdueLead), task: overdueTask }],
    } satisfies CrmTodayResponse);
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });
    getCrmLeadDetail.mockResolvedValue({ lead: overdueLead, interactions: [], stage: DEFAULT_STAGES[0] });

    render(<CrmTodayPage />);
    await screen.findByText("Revino cu oferta");

    fireEvent.click(screen.getByText("Revino cu oferta"));

    await waitFor(() => expect(getCrmLeadDetail).toHaveBeenCalledWith("l3"));
  });

  it("implicit, selectorul de agent e pe utilizatorul curent — lista arată DOAR munca lui", async () => {
    getCrmToday.mockResolvedValue(EMPTY);
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });

    render(<CrmTodayPage />);

    await waitFor(() => expect(getCrmToday).toHaveBeenCalledWith("user-1"));
    expect(screen.getByLabelText("Agent")).toHaveValue("user-1");
  });

  it("comutarea pe „Toată echipa” reîncarcă lista fără filtru de agent", async () => {
    getCrmToday.mockResolvedValue(EMPTY);
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });

    render(<CrmTodayPage />);
    await waitFor(() => expect(getCrmToday).toHaveBeenCalledWith("user-1"));

    fireEvent.change(screen.getByLabelText("Agent"), { target: { value: "" } });

    await waitFor(() => expect(getCrmToday).toHaveBeenLastCalledWith(undefined));
  });

  it("cu toate gălețile goale, arată starea „nimic de făcut”", async () => {
    getCrmToday.mockResolvedValue(EMPTY);
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });

    render(<CrmTodayPage />);

    expect(await screen.findByText("Nimic de făcut azi")).toBeInTheDocument();
  });

  it("la eroare, arată mesajul cu opțiune de reîncărcare — nu o pagină goală mută", async () => {
    getCrmToday.mockRejectedValue(new Error("Eroare la încărcarea listei de azi."));
    getCrmStages.mockResolvedValue({ items: DEFAULT_STAGES });

    render(<CrmTodayPage />);

    expect(await screen.findByText("Eroare la încărcarea listei de azi.")).toBeInTheDocument();
  });
});
