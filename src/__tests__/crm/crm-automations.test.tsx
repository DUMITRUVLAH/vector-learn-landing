/**
 * CRM — interfața pentru automatizări și distribuire.
 *
 * Ce verificăm aici nu e aspectul, ci trei promisiuni ale ecranului:
 *
 *  1. O regulă se CITEȘTE ca o frază în română. Cine se întoarce peste trei luni
 *     trebuie să înțeleagă din prima ce a scris — nu să descifreze condiții.
 *  2. O regulă care face rău se oprește instantaneu. Comutatorul e optimist:
 *     nu se așteaptă după server ca să arate că s-a oprit.
 *  3. Mesajele de validare de la server ajung la om, nu într-un log.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

beforeEach(() => {
  vi.clearAllMocks();
});

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

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: [], loading: false, error: null }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/automatizari", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const getCrmStages = vi.fn();
vi.mock("@/lib/api/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crm")>("@/lib/api/crm");
  return { ...actual, getCrmStages: (...a: unknown[]) => getCrmStages(...a) };
});

const listCrmAutomations = vi.fn();
const createCrmAutomation = vi.fn();
const updateCrmAutomation = vi.fn();
const deleteCrmAutomation = vi.fn();
const listCrmAutomationRuns = vi.fn();
vi.mock("@/lib/api/crmAutomations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmAutomations")>("@/lib/api/crmAutomations");
  return {
    ...actual,
    listCrmAutomations: (...a: unknown[]) => listCrmAutomations(...a),
    createCrmAutomation: (...a: unknown[]) => createCrmAutomation(...a),
    updateCrmAutomation: (...a: unknown[]) => updateCrmAutomation(...a),
    deleteCrmAutomation: (...a: unknown[]) => deleteCrmAutomation(...a),
    listCrmAutomationRuns: (...a: unknown[]) => listCrmAutomationRuns(...a),
  };
});

const listCrmAssignmentRules = vi.fn();
const listCrmAssignmentMembers = vi.fn();
const updateCrmAssignmentMember = vi.fn();
const createCrmAssignmentRule = vi.fn();
const updateCrmAssignmentRule = vi.fn();
vi.mock("@/lib/api/crmAssignment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmAssignment")>("@/lib/api/crmAssignment");
  return {
    ...actual,
    listCrmAssignmentRules: (...a: unknown[]) => listCrmAssignmentRules(...a),
    listCrmAssignmentMembers: (...a: unknown[]) => listCrmAssignmentMembers(...a),
    updateCrmAssignmentMember: (...a: unknown[]) => updateCrmAssignmentMember(...a),
    createCrmAssignmentRule: (...a: unknown[]) => createCrmAssignmentRule(...a),
    updateCrmAssignmentRule: (...a: unknown[]) => updateCrmAssignmentRule(...a),
  };
});

const { CrmAutomationsPage } = await import("@/pages/business/crm/CrmAutomationsPage");
const { describeAutomation } = await import("@/lib/api/crmAutomations");

const STAGES = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "s2", key: "contacted", label: "Contactat", color: "lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, probabilityPct: 25 },
];

const RULE = {
  id: "a1",
  name: "Sună clienții noi",
  enabled: true,
  trigger: { kind: "lead.created" as const, toStage: null },
  conditions: [{ field: "source", op: "eq" as const, value: "webform" }],
  actions: [{ type: "create_task" as const, title: "De sunat clientul", dueInDays: 2 }],
  orderIndex: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
};

// ─── Fraza care descrie regula ────────────────────────────────────────────────

describe("o regulă se citește ca o frază", () => {
  it("[blocant] descrierea spune când, cu ce condiții și ce face", () => {
    const text = describeAutomation(RULE, (k) => STAGES.find((s) => s.key === k)?.label ?? k);
    expect(text).toContain("Când apare un lead nou");
    expect(text).toContain("Sursă este exact");
    expect(text).toContain("creează taskul");
    expect(text).toContain("2 zile");
  });

  it("folosește ETICHETA etapei, nu cheia ei tehnică", () => {
    // „contacted" nu înseamnă nimic pentru cine n-a scris codul.
    const text = describeAutomation(
      { ...RULE, trigger: { kind: "lead.stage_changed", toStage: "contacted" }, conditions: [] },
      (k) => STAGES.find((s) => s.key === k)?.label ?? k
    );
    expect(text).toContain("Contactat");
    expect(text).not.toContain("contacted");
  });

  it("o condiție care nu cere valoare nu inventează una", () => {
    const text = describeAutomation(
      { ...RULE, conditions: [{ field: "email", op: "not_exists" }] },
      (k) => k
    );
    expect(text).toContain("Email e gol");
    expect(text).not.toContain("„”");
  });
});

// ─── Ecranul ──────────────────────────────────────────────────────────────────

describe("pagina de automatizări", () => {
  beforeEach(() => {
    getCrmStages.mockResolvedValue({ items: STAGES });
    listCrmAutomations.mockResolvedValue({ items: [RULE] });
    listCrmAutomationRuns.mockResolvedValue({ items: [] });
    listCrmAssignmentRules.mockResolvedValue({ items: [] });
    listCrmAssignmentMembers.mockResolvedValue({ items: [] });
  });

  it("regula apare cu numele și cu fraza care o explică", async () => {
    render(<CrmAutomationsPage />);
    expect(await screen.findByText("Sună clienții noi")).toBeTruthy();
    expect(screen.getByText(/creează taskul/i)).toBeTruthy();
  });

  it("[blocant] comutatorul oprește regula imediat, fără să aștepte serverul", async () => {
    // O regulă care face rău se oprește sub presiune. Dacă butonul ar aștepta
    // răspunsul, omul ar apăsa de trei ori, nesigur că a mers.
    let resolveUpdate: (v: unknown) => void = () => {};
    updateCrmAutomation.mockImplementation(() => new Promise((r) => (resolveUpdate = r)));

    render(<CrmAutomationsPage />);
    const sw = await screen.findByLabelText(/oprește regula sună clienții noi/i);
    fireEvent.click(sw);

    expect(await screen.findByText("Oprită")).toBeTruthy();
    resolveUpdate({});
  });

  it("dacă oprirea pică pe server, comutatorul revine — nu minte", async () => {
    updateCrmAutomation.mockRejectedValue(new Error("Fără conexiune"));
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByLabelText(/oprește regula/i));

    await waitFor(() => expect(screen.queryByText("Oprită")).toBeNull());
    expect(screen.getByText(/fără conexiune/i)).toBeTruthy();
  });

  it("[blocant] mesajele de validare de la server ajung la om", async () => {
    const err = Object.assign(new Error("invalid_automation"), {
      data: { problems: ["Regula mută lead-ul în chiar etapa care o declanșează — ar porni la nesfârșit."] },
    });
    createCrmAutomation.mockRejectedValue(err);

    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /regulă nouă/i }));
    fireEvent.change(await screen.findByLabelText(/numele regulii/i), { target: { value: "Bucla mea" } });
    fireEvent.click(screen.getByRole("button", { name: /^salvează$/i }));

    expect(await screen.findByText(/la nesfârșit/i)).toBeTruthy();
  });

  it("alegerea declanșatorului „intră într-o etapă” scoate la iveală lista de etape", async () => {
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /regulă nouă/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/^etapa$/i)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^când$/i), { target: { value: "lead.stage_changed" } });
    expect(await within(dialog).findByLabelText(/^etapa$/i)).toBeTruthy();
  });

  it("schimbarea tipului de acțiune nu lasă câmpurile vechi pe ecran", async () => {
    // Altfel omul ar putea salva un „mută în etapă" care mai poartă titlul de task.
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /regulă nouă/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/titlul taskului/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^acțiunea$/i), { target: { value: "add_tag" } });

    await waitFor(() => expect(within(dialog).queryByLabelText(/titlul taskului/i)).toBeNull());
    expect(within(dialog).getByLabelText(/^eticheta$/i)).toBeTruthy();
  });

  it("fără nicio regulă, ecranul dă un exemplu concret, nu doar „gol”", async () => {
    listCrmAutomations.mockResolvedValue({ items: [] });
    render(<CrmAutomationsPage />);
    expect(await screen.findByText(/nicio regulă proprie încă/i)).toBeTruthy();
    expect(screen.getByText(/trimite oferta/i)).toBeTruthy();
  });
});

// ─── CRM-A02: scenariile gata făcute ─────────────────────────────────────────

describe("scenariile gata făcute", () => {
  beforeEach(() => {
    getCrmStages.mockResolvedValue({ items: STAGES });
    listCrmAutomations.mockResolvedValue({ items: [] });
    listCrmAutomationRuns.mockResolvedValue({ items: [] });
    listCrmAssignmentRules.mockResolvedValue({ items: [] });
    listCrmAssignmentMembers.mockResolvedValue({ items: [] });
  });

  it("[blocant] pagina goală arată deja scenariile, fiecare cu comutatorul lui", async () => {
    render(<CrmAutomationsPage />);
    expect(await screen.findByText("Scenarii gata făcute")).toBeTruthy();
    expect(screen.getByLabelText(/pornește scenariul sună fiecare lead nou/i)).toBeTruthy();
    expect(screen.getByLabelText(/pornește scenariul nu lăsa lead-urile uitate/i)).toBeTruthy();
  });

  it("[blocant] comutatorul pornește scenariul: creează regula, ținând minte din ce scenariu vine", async () => {
    createCrmAutomation.mockImplementation(async (body: Record<string, unknown>) => ({
      id: "n1",
      orderIndex: 0,
      createdAt: "2026-09-26T00:00:00.000Z",
      ...body,
    }));
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByLabelText(/pornește scenariul nu lăsa lead-urile uitate/i));
    await waitFor(() => expect(createCrmAutomation).toHaveBeenCalled());
    const body = createCrmAutomation.mock.calls[0][0] as Record<string, unknown>;
    expect(body.templateKey).toBe("idle-3-days");
    expect(body.enabled).toBe(true);
    expect(body.trigger).toEqual({ kind: "lead.idle", idleDays: 3 });
    expect(await screen.findByLabelText(/oprește scenariul nu lăsa lead-urile uitate/i)).toBeTruthy();
  });

  it("un scenariu deja pornit apare pornit și NU se mai adaugă a doua oară printre regulile proprii", async () => {
    listCrmAutomations.mockResolvedValue({
      items: [
        {
          ...RULE,
          id: "t1",
          name: "Sună fiecare lead nou în aceeași zi",
          templateKey: "new-lead-call",
          conditions: [],
          actions: [{ type: "create_task", title: "Sună clientul", dueInDays: 0 }],
        },
      ],
    });
    render(<CrmAutomationsPage />);
    expect(await screen.findByLabelText(/oprește scenariul sună fiecare lead nou/i)).toBeTruthy();
    expect(screen.getByText(/nicio regulă proprie încă/i)).toBeTruthy();
  });

  it("scenariul care cere o etapă „câștigat” spune de ce nu se poate porni, pe o pâlnie fără ea", async () => {
    render(<CrmAutomationsPage />);
    expect(await screen.findByText(/n-are o etapă marcată „câștigat”/i)).toBeTruthy();
    expect((screen.getByLabelText(/pornește scenariul pașii de după vânzare/i) as HTMLButtonElement).disabled).toBe(true);
  });

  it("„Personalizează” deschide editorul completat, cu fraza de control", async () => {
    render(<CrmAutomationsPage />);
    await screen.findByText("Scenarii gata făcute");
    fireEvent.click(screen.getAllByRole("button", { name: /personalizează/i })[1]);
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText(/după câte zile/i) as HTMLInputElement).value).toBe("3");
    expect(within(dialog).getByText(/stă neatins 3 zile/i)).toBeTruthy();
  });

  it("condiția pe sursă se alege din listă cu nume, nu se tastează cheia din bază", async () => {
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /regulă nouă/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /condiție/i }));
    expect(within(dialog).getByLabelText("Reclamă Facebook")).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText("Instagram"));
    expect(within(dialog).getByText(/sursă este unul dintre „instagram”/i)).toBeTruthy();
  });
});

// ─── Distribuirea ─────────────────────────────────────────────────────────────

const MEMBERS = [
  {
    userId: "u1",
    name: "Ana Pop",
    isActive: true,
    dailyCapacity: 20,
    weight: 1,
    regions: ["Nord"],
    industries: [],
    orderIndex: 0,
    assignedToday: 20,
  },
  {
    userId: "u2",
    name: "Vasile Rusu",
    isActive: false,
    dailyCapacity: 0,
    weight: 2,
    regions: [],
    industries: [],
    orderIndex: 1,
    assignedToday: 3,
  },
];

describe("fila de distribuire", () => {
  beforeEach(() => {
    getCrmStages.mockResolvedValue({ items: STAGES });
    listCrmAutomations.mockResolvedValue({ items: [] });
    listCrmAutomationRuns.mockResolvedValue({ items: [] });
    listCrmAssignmentRules.mockResolvedValue({ items: [] });
    listCrmAssignmentMembers.mockResolvedValue({ items: MEMBERS });
  });

  async function openTab() {
    render(<CrmAutomationsPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /distribuire/i }));
    return screen.findByRole("table", { name: /agenții și norma lor/i });
  }

  it("[blocant] arată încărcarea de AZI lângă normă — asta se reglează, nu configurarea", async () => {
    const table = await openTab();
    const row = within(table).getByText("Ana Pop").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("20")).toBeTruthy();
  });

  it("scoaterea din tragere e un comutator, nu o ștergere de cont", async () => {
    await openTab();
    // Vasile e deja scos; butonul lui îl pune la loc, nu îl șterge.
    expect(screen.getByLabelText(/pune în tragere pe vasile rusu/i)).toBeTruthy();
    expect(screen.queryByLabelText(/șterge agentul/i)).toBeNull();
  });

  it("schimbarea normei se salvează pe loc", async () => {
    updateCrmAssignmentMember.mockResolvedValue({});
    await openTab();
    fireEvent.change(screen.getByLabelText(/norma zilnică pentru ana pop/i), { target: { value: "30" } });
    await waitFor(() => expect(updateCrmAssignmentMember).toHaveBeenCalledWith("u1", { dailyCapacity: 30 }));
  });

  it("regiunile se scriu ca text simplu, despărțite prin virgulă", async () => {
    updateCrmAssignmentMember.mockResolvedValue({});
    await openTab();
    fireEvent.change(screen.getByLabelText(/regiunile acoperite de ana pop/i), {
      target: { value: "Nord, Centru" },
    });
    await waitFor(() =>
      expect(updateCrmAssignmentMember).toHaveBeenCalledWith("u1", { regions: ["Nord", "Centru"] })
    );
  });

  it("fără reguli, ecranul spune ce se întâmplă în lipsa lor", async () => {
    await openTab();
    expect(screen.getByText(/rămân neatribuite/i)).toBeTruthy();
  });

  it("[blocant] scenariile de distribuire sunt deja pe ecran și pornirea unuia îl oprește pe celălalt", async () => {
    listCrmAssignmentRules.mockResolvedValue({
      items: [
        { id: "r1", name: "Pe rând, la toată echipa", enabled: true, strategy: "round_robin", conditions: [], userIds: [], orderIndex: 0, templateKey: "dist-round-robin" },
      ],
    });
    updateCrmAssignmentRule.mockResolvedValue({});
    createCrmAssignmentRule.mockResolvedValue({});
    await openTab();
    expect(screen.getByLabelText(/oprește scenariul pe rând, la toată echipa/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/pornește scenariul primește cine are loc azi/i));
    await waitFor(() => expect(createCrmAssignmentRule).toHaveBeenCalled());
    expect(updateCrmAssignmentRule).toHaveBeenCalledWith("r1", { enabled: false });
    expect((createCrmAssignmentRule.mock.calls[0][0] as Record<string, unknown>).templateKey).toBe("dist-capacity");
  });

  it("fiecare strategie își explică rostul, ca omul să poată alege", async () => {
    await openTab();
    fireEvent.click(screen.getByRole("button", { name: /regulă nouă/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/în ordinea din listă/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/cum se împarte/i), { target: { value: "territory" } });
    expect(await within(dialog).findByText(/acoperă regiunea/i)).toBeTruthy();
  });
});
