/**
 * CRM-G03 — Acasă: ce ai de făcut și la ce s-a lucrat, nu o grilă de 12 carduri-meniu.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "me", name: "Irina Oriol", role: "admin" }, tenant: { name: "ATIC", slug: "atic", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));
vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: [{ id: "me", fullName: "Irina Oriol", email: "i@a.md", role: "admin" }], loading: false, error: null }),
}));
vi.mock("@/hooks/useCrmPermissions", () => ({ useCrmPermissions: () => ({ can: () => true, permissions: [], role: "admin", loading: false }) }));
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));
vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ pageTitle, children }: { pageTitle: string; children: React.ReactNode }) => (
    <main>
      <h1>{pageTitle}</h1>
      {children}
    </main>
  ),
}));

const getCrmToday = vi.fn();
const listCrmLeads = vi.fn();
const getCrmStages = vi.fn();
const listCrmPipelines = vi.fn();
vi.mock("@/lib/api/crm", () => ({
  listCrmPipelines: (...a: unknown[]) => listCrmPipelines(...a),
  getCrmToday: (...a: unknown[]) => getCrmToday(...a),
  listCrmLeads: (...a: unknown[]) => listCrmLeads(...a),
  getCrmStages: (...a: unknown[]) => getCrmStages(...a),
}));

const { CrmHomePage, relativeTime } = await import("@/pages/business/crm/CrmHomePage");

const lead = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  fullName: "Tatiana Frunze",
  dealName: null,
  phone: null,
  company: "Medlife Clinic SRL",
  stage: "new",
  assignedTo: "me",
  valueCents: 29_000_00,
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-09-24T10:00:00.000Z",
  interestCourse: "Training AI",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  listCrmPipelines.mockResolvedValue({ items: [{ id: "p1" }, { id: "p2" }] });
  getCrmStages.mockImplementation((id: string) =>
    Promise.resolve({ items: id === "p2" ? [{ key: "rezerva", label: "Rezervă rece" }] : [{ key: "new", label: "Lead nou" }] })
  );
  getCrmToday.mockResolvedValue({
    overdueTasks: [{ lead: lead(), task: { id: "t1", title: "Programează întâlnirea", dueAt: "2026-09-22T10:00:00.000Z" } }],
    uncontacted: [lead({ id: "l2", company: null, fullName: "Ion Rusu" })],
    noNextStep: [],
    neglected: [],
  });
  listCrmLeads.mockResolvedValue({
    items: [lead(), lead({ id: "l3", stage: "rezerva", company: "Vest Construct SRL" })],
    page: 1,
    pageSize: 10,
    total: 2,
    totalPages: 1,
  });
});

describe("CRM-G03 — Acasă", () => {
  it("[blocant] nu mai e o grilă de carduri-meniu: arată ce ai de făcut, cu link la fișa leadului", async () => {
    render(<CrmHomePage />);
    const todo = await screen.findByRole("list", { name: "De făcut" });
    const overdue = within(todo).getByText("Programează întâlnirea").closest("a");
    expect(overdue).toHaveAttribute("href", "#/business/crm/pipeline?lead=l1");
    expect(within(todo).getByText("Ion Rusu")).toBeInTheDocument();
    // Doar taskurile MELE: cererea poartă id-ul meu.
    expect(getCrmToday).toHaveBeenCalledWith("me");
    expect(screen.queryByText(/Accesează/)).not.toBeInTheDocument();
  });

  it("[blocant] afacerile recente vin sortate după ultima modificare și se deschid pe fișă", async () => {
    render(<CrmHomePage />);
    const table = await screen.findByRole("table", { name: "Afaceri recente" });
    expect(listCrmLeads).toHaveBeenCalledWith(expect.objectContaining({ sort: "updatedAt", dir: "desc" }));
    expect(within(table).getByText("Lead nou")).toBeInTheDocument();
    // Etapa unei alte pâlnii apare cu numele ei, nu cu cheia din bază.
    expect(within(table).getByText("Rezervă rece")).toBeInTheDocument();
    expect(within(table).queryByText("rezerva")).not.toBeInTheDocument();
    expect(within(table).getAllByText("Irina Oriol")).toHaveLength(2);
    expect(within(table).getAllByRole("link")[0]).toHaveAttribute("href", "#/business/crm/pipeline?lead=l1");
  });

  it("[normal] o secțiune picată nu golește pagina", async () => {
    getCrmToday.mockRejectedValue(new Error("boom"));
    render(<CrmHomePage />);
    expect(await screen.findByRole("table", { name: "Afaceri recente" })).toBeInTheDocument();
    expect(screen.getByText(/O parte din pagină nu s-a putut încărca/)).toBeInTheDocument();
  });

  it("[normal] salutul folosește prenumele", async () => {
    render(<CrmHomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bună, Irina");
    await screen.findByRole("table", { name: "Afaceri recente" });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-25T12:00:00");
  it("scrie ca Drive: minute, ore, ieri, apoi data", () => {
    expect(relativeTime("2026-09-25T11:50:00", now)).toBe("acum 10 min");
    expect(relativeTime("2026-09-25T09:00:00", now)).toBe("acum 3 ore");
    expect(relativeTime("2026-09-24T09:00:00", now)).toBe("ieri");
    expect(relativeTime("2026-09-12T09:00:00", now)).toMatch(/12/);
  });
});
