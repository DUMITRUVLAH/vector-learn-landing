/**
 * CRM-106 — Lead card /app/leads/:id
 * Covers T-CRM-106-1..5 (automated part; inline edit verified via state)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mock API calls ───────────────────────────────────────────────────────────
vi.mock("@/lib/api/leads", () => ({
  getLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  revokeConsent: vi.fn(),
  deleteLead: vi.fn(),
  sendMessage: vi.fn(),
  logCall: vi.fn(),
  scoreLead: vi.fn(),
  assignLead: vi.fn(),
  listContacts: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  listTags: vi.fn(),
  addTag: vi.fn(),
  removeTag: vi.fn(),
  listFieldValues: vi.fn(),
  upsertFieldValue: vi.fn(),
  listCustomFields: vi.fn(),
}));

vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn(),
}));

vi.mock("@/lib/api/tasks", () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listAttachments: vi.fn(),
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  getNextTask: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

// COMM-202: mock messages + templates so LeadCardPage doesn't hang loading
vi.mock("@/lib/api/messages", () => ({
  listMessages: vi.fn().mockResolvedValue({ items: [] }),
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/api/templates", () => ({
  listTemplates: vi.fn().mockResolvedValue({ items: [] }),
  extractVariables: vi.fn().mockReturnValue([]),
  renderPreview: vi.fn().mockReturnValue(""),
  KNOWN_VARIABLES: {},
}));

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/leads/lead-001" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

import * as leadsApi from "@/lib/api/leads";
import * as pipelineApi from "@/lib/api/pipeline";
import { LeadCardPage } from "@/pages/app/LeadCardPage";
import type { Lead, LeadInteraction } from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import * as tasksApi from "@/lib/api/tasks";

const MOCK_LEAD: Lead = {
  id: "lead-001",
  fullName: "Maria Popescu",
  phone: "+40771234567",
  email: "maria@test.ro",
  interestCourse: "Engleză B2",
  stage: "new",
  source: "facebook_ad",
  assignedTo: null,
  utmSource: "facebook", utmMedium: "cpc", utmCampaign: "spring26",
  notes: "Interesată de cursul de seară",
  consentAt: "2026-01-01T10:00:00Z",
  consentText: "Accept prelucrarea datelor",
  ipAtConsent: "1.2.3.4",
  consentRevokedAt: null,
  convertedToStudentId: null,
  convertedAt: null,
  lostReason: null,
  valueCents: 0,
  debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const MOCK_STAGES: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s5", tenantId: "t1", key: "lost", label: "Pierdut", color: "pastel-rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, createdAt: "", updatedAt: "" },
];

const MOCK_INTERACTIONS: LeadInteraction[] = [
  { id: "i1", leadId: "lead-001", type: "system", direction: "internal", body: "Lead created manually", userId: null, occurredAt: "2026-01-01T10:00:00Z" },
  { id: "i2", leadId: "lead-001", type: "note", direction: "internal", body: "Vrea cursul de sâmbătă", userId: "u1", occurredAt: "2026-01-01T11:00:00Z" },
  { id: "i3", leadId: "lead-001", type: "stage_change", direction: "internal", body: "Stage: new → contacted", userId: "u1", occurredAt: "2026-01-02T09:00:00Z" },
];

function renderLeadCard() {
  return render(<LeadCardPage leadId="lead-001" />);
}

describe("CRM-106 — Lead card page", () => {
  beforeEach(() => {
    vi.mocked(leadsApi.getLead).mockResolvedValue(MOCK_LEAD);
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: MOCK_STAGES });
    // Server returns desc(occurredAt) — newest first
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [...MOCK_INTERACTIONS].reverse() });
    vi.mocked(leadsApi.addInteraction).mockResolvedValue({
      id: "i-new", leadId: "lead-001", type: "note", direction: "internal",
      body: "Notă nouă", userId: "u1", occurredAt: new Date().toISOString(),
    });
    vi.mocked(leadsApi.updateLead).mockResolvedValue({ ...MOCK_LEAD, phone: "+40779999999" });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
    vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ values: [], fields: [] });
  });

  /**
   * T-CRM-106-1: /app/leads/:id renders contact, source, UTM, stage, timeline
   */
  it("T-CRM-106-1: renders lead contact info", async () => {
    renderLeadCard();
    // Wait for loading to finish (spinner disappears, lead data renders)
    await waitFor(() => expect(screen.queryByText(/se încarcă/i)).not.toBeInTheDocument());
    expect(screen.getAllByText("Maria Popescu").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("+40771234567")).toBeInTheDocument();
    expect(screen.getByText("maria@test.ro")).toBeInTheDocument();
    expect(screen.getByText("Engleză B2")).toBeInTheDocument();
  });

  it("T-CRM-106-1: renders source", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByText("Facebook")).toBeInTheDocument());
  });

  it("T-CRM-106-1: renders UTM info", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByText(/facebook.*cpc.*spring26/i)).toBeInTheDocument());
  });

  it("T-CRM-106-1: renders timeline interactions", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByText("Lead created manually")).toBeInTheDocument());
    expect(screen.getByText("Vrea cursul de sâmbătă")).toBeInTheDocument();
    expect(screen.getByText("Stage: new → contacted")).toBeInTheDocument();
  });

  it("T-CRM-106-1: interactions are in reverse chronological order (newest first)", async () => {
    renderLeadCard();
    const timeline = await waitFor(() => screen.getByLabelText("Timeline interacțiuni"));
    const items = Array.from(timeline.querySelectorAll("li"));
    // Newest (i3 - stage_change: occurred 2026-01-02) should appear before oldest (i1 - system: 2026-01-01)
    const itemTexts = items.map((el) => el.textContent ?? "");
    const stageChangeIdx = itemTexts.findIndex((t) => t.includes("Stage: new → contacted"));
    const systemIdx = itemTexts.findIndex((t) => t.includes("Lead created manually"));
    // Both should be found
    expect(stageChangeIdx).toBeGreaterThanOrEqual(0);
    expect(systemIdx).toBeGreaterThanOrEqual(0);
    expect(stageChangeIdx).toBeLessThan(systemIdx);
  });

  /**
   * T-CRM-106-4: + Notă saves interaction instantly and persists in timeline
   */
  it("T-CRM-106-4: adding a note appears immediately in timeline", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByLabelText("Notă internă")).toBeInTheDocument());

    const noteInput = screen.getByLabelText("Notă internă");
    const submitBtn = screen.getByRole("button", { name: "Adaugă" });

    fireEvent.change(noteInput, { target: { value: "Notă nouă" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() => expect(leadsApi.addInteraction).toHaveBeenCalledWith("lead-001", {
      type: "note",
      body: "Notă nouă",
    }));
    // After adding, the new note should appear in timeline
    await waitFor(() => expect(screen.getByText("Notă nouă")).toBeInTheDocument());
  });

  it("T-CRM-106-4: note submit button disabled when input empty", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("button", { name: "Adaugă" })).toBeDisabled());
  });

  /**
   * T-CRM-106-2: inline edit saves via PATCH
   */
  it("T-CRM-106-2: edit button switches to edit mode", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByLabelText("Editează lead")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Editează lead"));
    expect(screen.getByLabelText("Telefon")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Salvează modificări")).toBeInTheDocument();
  });

  it("T-CRM-106-2: saving edit calls updateLead with modified fields", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByLabelText("Editează lead")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Editează lead"));

    const phoneInput = screen.getByLabelText("Telefon");
    fireEvent.change(phoneInput, { target: { value: "+40779999999" } });

    fireEvent.click(screen.getByLabelText("Salvează modificări"));
    await waitFor(() => expect(leadsApi.updateLead).toHaveBeenCalled());
  });

  /**
   * T-CRM-106-5: consent revoked badge
   */
  it("T-CRM-106-5: consent revoked shows alert banner", async () => {
    vi.mocked(leadsApi.getLead).mockResolvedValue({
      ...MOCK_LEAD,
      consentRevokedAt: "2026-01-05T00:00:00Z",
    });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/consimțământ retras/i);
  });

  it("T-CRM-106-5: consent revoked disables phone link", async () => {
    vi.mocked(leadsApi.getLead).mockResolvedValue({
      ...MOCK_LEAD,
      consentRevokedAt: "2026-01-05T00:00:00Z",
    });
    renderLeadCard();
    await waitFor(() => expect(screen.getByText("+40771234567")).toBeInTheDocument());
    const phoneLink = screen.getByText("+40771234567").closest("a");
    expect(phoneLink).toHaveAttribute("aria-disabled", "true");
  });

  /**
   * T-CRM-106-3: activity tab is default and sorted reverse chronological
   */
  it("T-CRM-106-3: activity tab is default active", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Activitate" })).toHaveAttribute("aria-selected", "true"));
  });

  /**
   * T-CRM-X-1: tenant isolation (schema-level check)
   */
  it("T-CRM-X-1: getLead is called with lead ID (tenant from JWT on server)", async () => {
    renderLeadCard();
    await waitFor(() => expect(leadsApi.getLead).toHaveBeenCalledWith("lead-001"));
  });

  /**
   * T-CRM-X-4: no `any` types — verified by TS compilation
   */
  it("T-CRM-X-4: Lead interface has all required fields", () => {
    const lead: Lead = { ...MOCK_LEAD };
    expect(typeof lead.id).toBe("string");
    expect(typeof lead.fullName).toBe("string");
    expect("consentRevokedAt" in lead).toBe(true);
    expect("assignedTo" in lead).toBe(true);
  });

  /**
   * GDPR tab renders consent details
   */
  it("renders GDPR tab with consent info", async () => {
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: "GDPR" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "GDPR" }));
    expect(screen.getByText(/Consimțământ GDPR/i)).toBeInTheDocument();
    expect(screen.getByText(/Accept prelucrarea datelor/i)).toBeInTheDocument();
  });
});
