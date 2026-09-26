/**
 * CRM Faza 9 — fișa leadului pe FILE.
 *
 * Până acum fișa era un singur scroll: taskurile peste acte, actele peste formular, iar ca să
 * ajungi la istoric derulai pe lângă tot. Aici se verifică ce înseamnă concret „file": fiecare
 * filă își cere DATELE EI (nu se încarcă tot la deschidere), iar antetul — etapa, valoarea,
 * acțiunile rapide — rămâne deasupra, fiindcă e context, nu conținut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

const sendCrmEmail = vi.fn();
const createCrmLeadTask = vi.fn();
vi.mock("@/lib/api/crmComms", () => ({
  whatsappLink: () => null,
  logCrmTouch: vi.fn(),
  sendCrmEmail: (...a: unknown[]) => sendCrmEmail(...a),
  EMAIL_STATUS_LABELS: { sent: "Trimis", blocked: "Blocat", failed: "Eșuat" },
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
  createCrmLeadTask: (...a: unknown[]) => createCrmLeadTask(...a),
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

const STAGES2: CrmStage[] = [
  ...STAGES,
  { id: "s2", key: "contacted", label: "Contactat", color: "sky", orderIndex: 1, isWon: false, isLost: false, isDefault: false, probabilityPct: 20 },
];

describe("CRM-U02 — Activitate", () => {
  it("[blocant] emailul trimis din fișă apare pe loc în Activitate, cu subiectul", async () => {
    const lead = makeLead({ email: "office@acme.md" });
    const sent = {
      id: "i-email",
      leadId: "lead-1",
      type: "email",
      direction: "outbound",
      body: "Vă trimit oferta.",
      metadata: { to: "office@acme.md", subject: "Oferta Acme", status: "sent" },
      userId: "u1",
      occurredAt: "2026-09-26T10:00:00.000Z",
    };
    getCrmLeadDetail
      .mockResolvedValueOnce({ lead, interactions: [], stage: STAGES[0] })
      .mockResolvedValue({ lead, interactions: [sent], stage: STAGES[0] });
    sendCrmEmail.mockResolvedValue({ status: "sent", interaction: sent });

    render(<LeadDetailSheet leadId="lead-1" stages={STAGES} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} onOpenLead={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Scrie email/ }));
    const dialog = await screen.findByRole("dialog", { name: /mail/i });
    fireEvent.change(within(dialog).getByLabelText(/Subiect/i), { target: { value: "Oferta Acme" } });
    fireEvent.change(within(dialog).getByLabelText(/Mesaj|Textul/i), { target: { value: "Vă trimit oferta." } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Trimite/ }));

    await waitFor(() => expect(getCrmLeadDetail).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Oferta Acme")).toBeInTheDocument();
    expect(screen.getByText("Trimis către office@acme.md")).toBeInTheDocument();
  });

  it("[blocant] mutarea de etapă se citește cu numele etapelor, nu cu cheile interne", async () => {
    getCrmLeadDetail.mockResolvedValue({
      lead: makeLead({ stage: "contacted" }),
      stage: STAGES2[1],
      interactions: [
        {
          id: "i-stage",
          leadId: "lead-1",
          type: "stage_change",
          direction: "internal",
          body: "new → contacted",
          metadata: { from: "new", to: "contacted", cause: "Oferta OF-1 a fost trimisă clientului." },
          userId: "u1",
          occurredAt: "2026-09-26T10:00:00.000Z",
        },
      ],
    });
    render(<LeadDetailSheet leadId="lead-1" stages={STAGES2} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} onOpenLead={vi.fn()} />);
    expect(await screen.findByText("Lead nou → Contactat")).toBeInTheDocument();
    expect(screen.getByText(/Oferta OF-1 a fost trimisă/)).toBeInTheDocument();
    expect(screen.queryByText("new → contacted")).not.toBeInTheDocument();
  });

  it("[normal] fila cu modificările fișei nu se mai numește „Istoric” (se confunda cu Activitatea)", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    render(<LeadDetailSheet leadId="lead-1" stages={STAGES} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} onOpenLead={vi.fn()} />);
    expect(await screen.findByRole("tab", { name: "Modificări" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Istoric" })).not.toBeInTheDocument();
  });
});

describe("CRM-U04 — taskul cu oră, din fișă", () => {
  it("[blocant] data + ora pleacă la server ca „cu oră”", async () => {
    getCrmLeadDetail.mockResolvedValue(makeDetail());
    createCrmLeadTask.mockImplementation((body: Record<string, unknown>) =>
      Promise.resolve({ id: "t1", tenantId: "t", leadId: "lead-1", status: "open", assignedTo: null, createdBy: null, completedAt: null, createdAt: "", updatedAt: "", ...body })
    );
    render(<LeadDetailSheet leadId="lead-1" stages={STAGES} onClose={vi.fn()} onChanged={vi.fn()} onToast={vi.fn()} onOpenLead={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Task nou"), { target: { value: "Sună clientul" } });
    fireEvent.change(screen.getByLabelText("Scadență"), { target: { value: "2026-09-27" } });
    fireEvent.change(screen.getByLabelText("Ora (opțional)"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Adaugă$/ }));
    await waitFor(() => expect(createCrmLeadTask).toHaveBeenCalled());
    const body = createCrmLeadTask.mock.calls[0][0] as { dueAt: string; dueHasTime: boolean };
    expect(body.dueHasTime).toBe(true);
    expect(new Date(body.dueAt).getHours()).toBe(14);
    expect(await screen.findByText(/Scadent .*14:30/)).toBeInTheDocument();
  });
});
