/**
 * CRM Faza 9 — fișa leadului pe FILE.
 *
 * Până acum fișa era un singur scroll: taskurile peste acte, actele peste formular, iar ca să
 * ajungi la istoric derulai pe lângă tot. Aici se verifică ce înseamnă concret „file": fiecare
 * filă își cere DATELE EI (nu se încarcă tot la deschidere), iar antetul — etapa, valoarea,
 * acțiunile rapide — rămâne deasupra, fiindcă e context, nu conținut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmLead, CrmLeadDetailResponse, CrmStage } from "@/lib/api/crm";

beforeEach(() => {
  vi.clearAllMocks();
});

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

vi.mock("@/lib/api/crmComms", () => ({
  whatsappLink: () => null,
  logCrmTouch: vi.fn(),
}));

vi.mock("@/lib/api/crmDocuments", () => ({
  listCrmDocuments: vi.fn().mockResolvedValue({ items: [] }),
  CRM_DOC_KIND_LABELS: {},
  CRM_DOC_STATUS_LABELS: {},
}));

const getCrmLeadDetail = vi.fn();
const listCrmLeadContacts = vi.fn();
const createCrmLeadContact = vi.fn();
const listCrmLeadFiles = vi.fn();
const getCrmPersonHistory = vi.fn();
const listCrmCustomFields = vi.fn();
const listCrmLeadFieldValues = vi.fn();
const setCrmLeadFieldValue = vi.fn();
const listCrmCadences = vi.fn().mockResolvedValue({ items: [] });
const listCrmLeadEnrollments = vi.fn().mockResolvedValue({ items: [] });
const enrollCrmLeadInCadence = vi.fn();
const listCrmAudit = vi.fn().mockResolvedValue({ items: [] });

vi.mock("@/lib/api/crm", () => ({
  // Panoul GDPR din fila „Detalii".
  crmGdprExportUrl: (id: string) => `/api/crm/gdpr/export/${id}`,
  anonymizeCrmLead: vi.fn(),
  revokeCrmLeadConsent: vi.fn().mockResolvedValue({ ok: true, consentRevokedAt: "2026-09-14T10:00:00.000Z" }),
  // Catalogul de produse: fișa îl cere pentru select-ul „Produs".
  listCrmProducts: vi.fn().mockResolvedValue({ items: [] }),
  // Drepturile utilizatorului: ecranele CRM le cer ca să știe ce butoane să arate.
  getCrmPermissions: vi.fn().mockResolvedValue({ role: "admin", permissions: ["leads.view_all", "leads.edit", "leads.delete", "pipelines.manage", "products.manage", "cadences.manage", "automations.manage", "assignment.manage", "audit.view"] }),
  getCrmLeadDetail: (...a: unknown[]) => getCrmLeadDetail(...a),
  listCrmLeadContacts: (...a: unknown[]) => listCrmLeadContacts(...a),
  createCrmLeadContact: (...a: unknown[]) => createCrmLeadContact(...a),
  updateCrmLeadContact: vi.fn(),
  deleteCrmLeadContact: vi.fn(),
  listCrmLeadFiles: (...a: unknown[]) => listCrmLeadFiles(...a),
  uploadCrmLeadFile: vi.fn(),
  deleteCrmLeadFile: vi.fn(),
  getCrmPersonHistory: (...a: unknown[]) => getCrmPersonHistory(...a),
  listCrmCustomFields: (...a: unknown[]) => listCrmCustomFields(...a),
  listCrmLeadFieldValues: (...a: unknown[]) => listCrmLeadFieldValues(...a),
  setCrmLeadFieldValue: (...a: unknown[]) => setCrmLeadFieldValue(...a),
  createCrmCustomField: vi.fn(),
  deleteCrmCustomField: vi.fn(),
  updateCrmLead: vi.fn(),
  moveCrmLeadStage: vi.fn(),
  createCrmLeadInteraction: vi.fn(),
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
  listCrmLostReasons: vi.fn().mockResolvedValue({ items: [] }),
  listCrmCadences: (...a: unknown[]) => listCrmCadences(...a),
  listCrmLeadEnrollments: (...a: unknown[]) => listCrmLeadEnrollments(...a),
  enrollCrmLeadInCadence: (...a: unknown[]) => enrollCrmLeadInCadence(...a),
  cancelCrmEnrollment: vi.fn(),
  listCrmAudit: (...a: unknown[]) => listCrmAudit(...a),
}));

const { LeadDetailSheet } = await import("@/components/crm/LeadDetailSheet");

const STAGES: CrmStage[] = [
  { id: "s1", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
];

function makeLead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    id: "lead-1",
    fullName: "Acme SRL",
    dealName: null,
    phone: "+37369000111",
    email: null,
    company: "Acme SRL",
    interestCourse: null,
    source: "manual",
    stage: "new",
    valueCents: 120000,
    assignedTo: null,
    lostReason: null,
    createdAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeDetail(): CrmLeadDetailResponse {
  return { lead: makeLead(), interactions: [], stage: STAGES[0] };
}

function renderSheet(onOpenLead = vi.fn()) {
  render(
    <LeadDetailSheet
      leadId="lead-1"
      stages={STAGES}
      onClose={vi.fn()}
      onChanged={vi.fn()}
      onToast={vi.fn()}
      onOpenLead={onOpenLead}
    />
  );
  return { onOpenLead };
}

describe("Fișa leadului pe file", () => {
  it("[blocant] fila „Contacte” își cere datele abia la deschidere — nu la deschiderea fișei", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmLeadContacts.mockResolvedValue({
      items: [
        { id: "c1", leadId: "lead-1", fullName: "Ion Decident", role: "Director", phone: "069", email: null, isPrimary: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    renderSheet();
    await screen.findByRole("tab", { name: "Contacte" });
    // Fișa e deschisă, dar contactele n-au fost cerute: fila nu e activă.
    expect(listCrmLeadContacts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Contacte" }));

    expect(await screen.findByText("Ion Decident")).toBeInTheDocument();
    expect(listCrmLeadContacts).toHaveBeenCalledWith("lead-1");
    expect(screen.getByText("principal")).toBeInTheDocument();
  });

  it("[blocant] CONTPLATA: fila „Acte” pornește un cont de plată cu datele leadului", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    renderSheet();
    fireEvent.click(await screen.findByRole("tab", { name: "Acte" }));
    const link = await screen.findByRole("link", { name: /Cont de plată/ });
    // O singură diez: `Button href` e o cale de router, nu un URL cu „#” (altfel ar ieși „##/…”).
    expect(link).toHaveAttribute("href", "#/business/crm/conturi-plata/nou?lead=lead-1");
  });

  it("[blocant] antetul (etapă, acțiuni rapide) rămâne vizibil în orice filă", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmLeadFiles.mockResolvedValue({ items: [] });

    renderSheet();
    await screen.findByRole("tab", { name: "Fișiere" });
    fireEvent.click(screen.getByRole("tab", { name: "Fișiere" }));

    await screen.findByText(/Niciun fișier atașat/);
    // Contextul nu dispare când schimbi fila.
    expect(screen.getByLabelText("Etapă")).toBeInTheDocument();
    // „Am sunat" e acum un select de rezultat (CC-6), nu un buton: apelul se notează ÎMPREUNĂ cu
    // ce a ieșit din el. Acțiunea rapidă e tot acolo — doar că spune ceva raportului.
    expect(screen.getByLabelText("Notează apelul cu rezultatul lui")).toBeInTheDocument();
  });

  it("[blocant] „Istoric” arată alt lead al aceleiași persoane și îl poate deschide", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    getCrmPersonHistory.mockResolvedValue({
      leads: [makeLead({ id: "lead-vechi", fullName: "Acme SRL (2025)", stage: "new", lostReason: "Preț prea mare" })],
      notesByLead: {
        "lead-vechi": [
          { id: "n1", leadId: "lead-vechi", type: "note", direction: "internal", body: "A refuzat oferta", metadata: null, userId: null, occurredAt: "2025-05-01T10:00:00.000Z" },
        ],
      },
    });

    const { onOpenLead } = renderSheet();
    await screen.findByRole("tab", { name: "Modificări" });
    fireEvent.click(screen.getByRole("tab", { name: "Modificări" }));

    expect(await screen.findByText("Acme SRL (2025)")).toBeInTheDocument();
    // Comentariul vechi e chiar motivul pentru care ecranul există.
    expect(screen.getByText("A refuzat oferta")).toBeInTheDocument();
    expect(screen.getByText(/Preț prea mare/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deschide" }));
    expect(onOpenLead).toHaveBeenCalledWith("lead-vechi");
  });

  it("[blocant] „Detalii” salvează un câmp personalizat la ieșirea din câmp, nu la fiecare tastă", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCustomFields.mockResolvedValue({
      items: [{ id: "f1", key: "nr_contract", label: "Nr. contract", type: "text", options: null, orderIndex: 0 }],
    });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });
    setCrmLeadFieldValue.mockResolvedValue({ id: "v1", leadId: "lead-1", fieldId: "f1", value: "C-114" });

    renderSheet();
    // „Detalii" nu mai e o filă: datele clientului stau permanent în coloana din stânga.
    await screen.findByLabelText("Nr. contract");

    const input = await screen.findByLabelText("Nr. contract");
    fireEvent.change(input, { target: { value: "C-114" } });
    expect(setCrmLeadFieldValue).not.toHaveBeenCalled(); // nicio cerere per tastă

    fireEvent.blur(input);
    await waitFor(() => expect(setCrmLeadFieldValue).toHaveBeenCalledWith("lead-1", "f1", "C-114"));
  });

  it("[normal] fila revine pe „Activitate” când se deschide alt lead", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmLeadFiles.mockResolvedValue({ items: [] });

    const { rerender } = render(
      <LeadDetailSheet leadId="lead-1" stages={STAGES} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} />
    );
    await screen.findByRole("tab", { name: "Fișiere" });
    fireEvent.click(screen.getByRole("tab", { name: "Fișiere" }));
    await screen.findByText(/Niciun fișier atașat/);

    rerender(
      <LeadDetailSheet leadId="lead-2" stages={STAGES} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Activitate" })).toHaveAttribute("aria-selected", "true")
    );
  });
});

describe("Cadențele leadului", () => {
  it("[blocant] agentul își înscrie leadul într-o cadență din fișă", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCadences.mockResolvedValue({
      items: [
        { id: "cad-1", name: "Urmărire ofertă", triggerStage: null, enabled: true, steps: [], createdAt: "", updatedAt: "" },
      ],
    });
    listCrmLeadEnrollments.mockResolvedValue({ items: [] });
    enrollCrmLeadInCadence.mockResolvedValue({
      id: "enr-1",
      leadId: "lead-1",
      cadenceId: "cad-1",
      status: "active",
      currentStep: 0,
      nextFireAt: "2026-03-20T10:00:00.000Z",
      enrolledAt: "2026-03-13T10:00:00.000Z",
    });

    renderSheet();
    const select = await screen.findByLabelText("Înscrie în cadență");
    fireEvent.change(select, { target: { value: "cad-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Înscrie" }));

    await waitFor(() => expect(enrollCrmLeadInCadence).toHaveBeenCalledWith("lead-1", "cad-1"));
    // Înscrierea apare pe loc, cu pasul și data următoare — nu după un refresh de pagină.
    expect(await screen.findByText("Urmărire ofertă")).toBeInTheDocument();
    expect(screen.getByText(/pasul 1/)).toBeInTheDocument();
  });

  it("[normal] fără nicio cadență în workspace, secțiunea nu există deloc", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCadences.mockResolvedValue({ items: [] });
    listCrmLeadEnrollments.mockResolvedValue({ items: [] });

    renderSheet();
    await screen.findByRole("tab", { name: "Activitate" });

    expect(screen.queryByText("Cadențe")).not.toBeInTheDocument();
  });
});

describe("Modificările din fișă", () => {
  it("[blocant] „Istoric” arată CINE a schimbat fișa, separat de ce s-a discutat", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    getCrmPersonHistory.mockResolvedValue({ leads: [], notesByLead: {} });
    listCrmAudit.mockResolvedValue({
      items: [
        {
          id: "a1",
          actionType: "crm.lead.stage_changed",
          targetType: "crm_lead",
          targetId: "lead-1",
          oldValue: { stage: "new" },
          newValue: { stage: "paid" },
          occurredAt: "2026-03-01T10:00:00.000Z",
          actorId: "user-2",
          actorName: "Boris Agent",
        },
      ],
    });

    renderSheet();
    fireEvent.click(await screen.findByRole("tab", { name: "Modificări" }));

    expect(await screen.findByText("Mutat între etape")).toBeInTheDocument();
    expect(screen.getByText(/Boris Agent/)).toBeInTheDocument();
    expect(screen.getByText(/stage: new → paid/)).toBeInTheDocument();
    expect(listCrmAudit).toHaveBeenCalledWith({ targetId: "lead-1", limit: 50 });
  });

  it("[blocant] fără dreptul de jurnal (403), blocul lipsește — nu arată o secțiune goală", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    getCrmPersonHistory.mockResolvedValue({ leads: [], notesByLead: {} });
    listCrmAudit.mockRejectedValue(new Error("forbidden"));

    renderSheet();
    fireEvent.click(await screen.findByRole("tab", { name: "Modificări" }));

    await screen.findByText(/Nicio altă cerere/);
    expect(screen.queryByText("Modificări în fișă")).not.toBeInTheDocument();
  });
});

describe("Drepturile persoanei (GDPR) pe fișă", () => {
  it("[blocant] cele trei drepturi stau lângă datele persoanei, unde se uită omul când primește cererea", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCustomFields.mockResolvedValue({ items: [] });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });

    renderSheet();
    await screen.findByLabelText("Nume*");

    // Exportul e un link, nu un buton: serverul trimite un fișier.
    const exportLink = await screen.findByRole("link", { name: /Exportă datele/i });
    expect(exportLink).toHaveAttribute("href", "/api/crm/gdpr/export/lead-1");
    expect(screen.getByRole("button", { name: /Retrage consimțământul/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Șterge datele personale/i })).toBeInTheDocument();
  });

  it("[blocant] un lead cu consimțământ retras o SPUNE, ca să nu-l mai sune nimeni", async () => {
    const detail = makeDetail();
    detail.lead = { ...detail.lead, consentRevokedAt: "2026-09-10T10:00:00.000Z" };
    getCrmLeadDetail.mockResolvedValue(detail);
    listCrmCustomFields.mockResolvedValue({ items: [] });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });

    renderSheet();
    await screen.findByLabelText("Nume*");

    expect(await screen.findByText(/Consimțământ retras/)).toBeInTheDocument();
    // Butonul de retragere dispare: nu se retrage de două ori.
    expect(screen.queryByRole("button", { name: /Retrage consimțământul/i })).not.toBeInTheDocument();
  });
});

describe("Fișa pe două coloane, pe ecran întreg", () => {
  it("[blocant] datele clientului sunt la vedere ODATĂ cu zona de lucru, nu într-o filă separată", async () => {
    // Regresia de evitat: ca să te uiți la telefonul omului în timp ce scrii nota, trebuia să
    // pleci din notă. Acum telefonul și caseta de notă trebuie să existe în ACELAȘI ecran.
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCustomFields.mockResolvedValue({ items: [] });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });

    renderSheet();

    expect(await screen.findByLabelText("Telefon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Adaugă o notă...")).toBeInTheDocument();
    // Iar „Detalii" nu mai e o filă în care să te pierzi.
    expect(screen.queryByRole("tab", { name: "Detalii" })).not.toBeInTheDocument();
  });

  it("[blocant] filele rămase sunt DOAR zona de lucru", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCustomFields.mockResolvedValue({ items: [] });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });

    renderSheet();
    await screen.findByRole("tab", { name: "Activitate" });

    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Activitate", "Fișiere", "Contacte", "Acte", "Modificări"]);
  });

  it("starea afacerii (etapă, valoare, responsabil) stă în bara de sus, nu îngropată în formular", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    listCrmCustomFields.mockResolvedValue({ items: [] });
    listCrmLeadFieldValues.mockResolvedValue({ items: [] });

    renderSheet();
    expect(await screen.findByText(/Responsabil:/)).toBeInTheDocument();
  });
});
