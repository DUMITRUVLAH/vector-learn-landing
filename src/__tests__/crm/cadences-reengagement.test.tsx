/**
 * CRM Faza 9 — ecranul de cadențe și reactivare.
 *
 * Ce trebuie să fie adevărat în interfață: o cadență se creează CU pașii ei (o cadență fără pași
 * nu face nimic), iar reactivarea NU are buton de rulare până nu se vede pe cine atinge —
 * scrie pe clienți reali, iar un buton care aplică direct e un mod bun de a trimite 300 de
 * taskuri din greșeală.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmCadence, CrmReengagementPreviewItem, CrmReengagementRule, CrmStage } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Test Admin", role: "owner" },
      tenant: { name: "Test", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/cadente", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const listCrmCadences = vi.fn();
const createCrmCadence = vi.fn();
const listCrmReengagementRules = vi.fn();
const createCrmReengagementRule = vi.fn();
const previewCrmReengagement = vi.fn();
const runCrmReengagement = vi.fn();
const runCrmCadencesNow = vi.fn();
const getCrmStages = vi.fn();

vi.mock("@/lib/api/crm", () => ({
  listCrmCadences: (...a: unknown[]) => listCrmCadences(...a),
  createCrmCadence: (...a: unknown[]) => createCrmCadence(...a),
  updateCrmCadence: vi.fn(),
  deleteCrmCadence: vi.fn(),
  runCrmCadencesNow: (...a: unknown[]) => runCrmCadencesNow(...a),
  listCrmReengagementRules: (...a: unknown[]) => listCrmReengagementRules(...a),
  createCrmReengagementRule: (...a: unknown[]) => createCrmReengagementRule(...a),
  updateCrmReengagementRule: vi.fn(),
  deleteCrmReengagementRule: vi.fn(),
  previewCrmReengagement: (...a: unknown[]) => previewCrmReengagement(...a),
  runCrmReengagement: (...a: unknown[]) => runCrmReengagement(...a),
  getCrmStages: (...a: unknown[]) => getCrmStages(...a),
}));

const { CrmCadencesPage } = await import("@/pages/business/crm/CrmCadencesPage");

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "s2", key: "lost", label: "Pierdut", color: "rose", orderIndex: 1, isWon: false, isLost: true, isDefault: true, probabilityPct: 0 },
];

function makeCadence(overrides: Partial<CrmCadence> = {}): CrmCadence {
  return {
    id: "cad-1",
    name: "Urmărire ofertă",
    triggerStage: null,
    enabled: true,
    steps: [{ dayOffset: 0, action: "task", title: "Sună clientul" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRule(overrides: Partial<CrmReengagementRule> = {}): CrmReengagementRule {
  return {
    id: "rule-1",
    name: "Trezește la 6 luni",
    enabled: true,
    afterMonths: 6,
    lostReasons: [],
    stageKeys: [],
    action: "create_task",
    cadenceId: null,
    taskTitle: "Sună clientul pierdut",
    orderIndex: 0,
    ...overrides,
  };
}

function makePreviewItem(overrides: Partial<CrmReengagementPreviewItem> = {}): CrmReengagementPreviewItem {
  return {
    ruleId: "rule-1",
    ruleName: "Trezește la 6 luni",
    action: "create_task",
    leadId: "lead-1",
    leadName: "Acme SRL",
    lostAt: "2025-06-01T00:00:00.000Z",
    lostReason: "Preț prea mare",
    ...overrides,
  };
}

function setup(opts: { cadences?: CrmCadence[]; rules?: CrmReengagementRule[] } = {}) {
  listCrmCadences.mockResolvedValue({ items: opts.cadences ?? [] });
  listCrmReengagementRules.mockResolvedValue({ items: opts.rules ?? [] });
  getCrmStages.mockResolvedValue({ items: STAGES });
}

describe("Cadențe", () => {
  it("[blocant] cadența nouă pleacă la server CU pașii ei", async () => {
    setup();
    createCrmCadence.mockResolvedValue(makeCadence());

    render(<CrmCadencesPage />);
    fireEvent.change(await screen.findByLabelText(/Cadență nouă/), { target: { value: "Urmărire ofertă" } });
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Sună clientul" } });
    fireEvent.click(screen.getByRole("button", { name: "Creează cadența" }));

    await waitFor(() =>
      expect(createCrmCadence).toHaveBeenCalledWith({
        name: "Urmărire ofertă",
        triggerStage: null,
        steps: [{ dayOffset: 0, action: "task", title: "Sună clientul" }],
      })
    );
  });

  it("[normal] pașii cadenței se văd în listă, cu ziua lor", async () => {
    setup({ cadences: [makeCadence({ steps: [{ dayOffset: 3, action: "note", title: "Verifică oferta" }] })] });

    render(<CrmCadencesPage />);

    expect(await screen.findByText("Ziua 3")).toBeInTheDocument();
    expect(screen.getByText("Verifică oferta")).toBeInTheDocument();
    expect(screen.getByText("notă")).toBeInTheDocument();
  });
});

describe("Reactivare", () => {
  it("[blocant] butonul de rulare apare DOAR după ce se vede pe cine atinge", async () => {
    setup({ rules: [makeRule()] });
    previewCrmReengagement.mockResolvedValue({ items: [makePreviewItem()] });

    render(<CrmCadencesPage />);
    await screen.findByText("Trezește la 6 luni");

    // Fără previzualizare nu există buton de rulare — reactivarea scrie pe clienți reali.
    expect(screen.queryByRole("button", { name: /Rulează pentru/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vezi pe cine atinge" }));

    expect(await screen.findByText("Acme SRL")).toBeInTheDocument();
    expect(screen.getByText(/Preț prea mare/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rulează pentru 1" })).toBeInTheDocument();
  });

  it("[blocant] rularea chiar cheamă serverul, iar previzualizarea se golește după", async () => {
    setup({ rules: [makeRule()] });
    previewCrmReengagement.mockResolvedValue({ items: [makePreviewItem()] });
    runCrmReengagement.mockResolvedValue({ ok: true, due: 1, applied: 1, failed: 0 });

    render(<CrmCadencesPage />);
    await screen.findByText("Trezește la 6 luni");
    fireEvent.click(screen.getByRole("button", { name: "Vezi pe cine atinge" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rulează pentru 1" }));

    await waitFor(() => expect(runCrmReengagement).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: /Rulează pentru/ })).not.toBeInTheDocument());
  });

  it("[normal] fără nicio etapă „pierdut” în pâlnie, ecranul spune de ce n-are ce treji", async () => {
    listCrmCadences.mockResolvedValue({ items: [] });
    listCrmReengagementRules.mockResolvedValue({ items: [] });
    getCrmStages.mockResolvedValue({ items: [STAGES[0]] });

    render(<CrmCadencesPage />);

    expect(await screen.findByText(/Nicio etapă marcată/)).toBeInTheDocument();
  });
});
