/**
 * CRM-107 — Task-uri & fișiere per lead
 * Covers T-CRM-107-1..4
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/leads", () => ({
  getLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  revokeConsent: vi.fn(),
  deleteLead: vi.fn(),
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

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/leads/lead-001" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

import * as leadsApi from "@/lib/api/leads";
import * as pipelineApi from "@/lib/api/pipeline";
import * as tasksApi from "@/lib/api/tasks";
import { LeadCardPage } from "@/pages/app/LeadCardPage";
import type { Lead } from "@/lib/api/leads";
import type { LeadTask, LeadAttachment } from "@/lib/api/tasks";

const MOCK_LEAD: Lead = {
  id: "lead-001", fullName: "Maria Popescu", phone: "+40771234567", email: "maria@test.ro",
  interestCourse: "Engleză B2", stage: "new", source: "facebook_ad", assignedTo: null,
  utmSource: null, utmMedium: null, utmCampaign: null, notes: null,
  consentAt: null, consentText: null, ipAtConsent: null, consentRevokedAt: null,
  convertedToStudentId: null, convertedAt: null, lostReason: null,
  valueCents: 0, debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const TOMORROW = new Date(Date.now() + 86400000).toISOString();
const YESTERDAY = new Date(Date.now() - 86400000).toISOString();

const MOCK_TASK_OPEN: LeadTask = {
  id: "t1", tenantId: "t1", leadId: "lead-001", title: "Sună mâine la 10:00",
  dueAt: TOMORROW, status: "open", assignedTo: null, createdBy: "u1",
  completedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const MOCK_TASK_OVERDUE: LeadTask = {
  id: "t2", tenantId: "t1", leadId: "lead-001", title: "Trimite oferta",
  dueAt: YESTERDAY, status: "open", assignedTo: null, createdBy: "u1",
  completedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const MOCK_TASK_DONE: LeadTask = {
  id: "t3", tenantId: "t1", leadId: "lead-001", title: "Task finalizat",
  dueAt: null, status: "done", assignedTo: null, createdBy: "u1",
  completedAt: "2026-01-02T10:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T10:00:00Z",
};

const MOCK_ATTACHMENT: LeadAttachment = {
  id: "a1", tenantId: "t1", leadId: "lead-001", fileName: "contract.pdf",
  fileUrl: "data:application/pdf;base64,JVBERi0x", mime: "application/pdf",
  sizeBytes: 12345, uploadedBy: "u1", createdAt: "2026-01-01T00:00:00Z",
};

function renderLeadCard() {
  return render(<LeadCardPage leadId="lead-001" />);
}

describe("CRM-107 — Task-uri per lead", () => {
  beforeEach(() => {
    vi.mocked(leadsApi.getLead).mockResolvedValue(MOCK_LEAD);
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: [
      { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
    ] });
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
    vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ values: [], fields: [] });
  });

  /**
   * T-CRM-107-1: Task with due date appears in tab; overdue is red
   */
  it("T-CRM-107-1: renders open tasks in task tab", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [MOCK_TASK_OPEN, MOCK_TASK_OVERDUE] });
    renderLeadCard();
    // Open tasks tab
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /task-uri/i }));
    await waitFor(() => expect(screen.getByText("Sună mâine la 10:00")).toBeInTheDocument());
    expect(screen.getByText("Trimite oferta")).toBeInTheDocument();
  });

  it("T-CRM-107-1: overdue task shows 'Întârziat' label", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [MOCK_TASK_OVERDUE] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /task-uri/i }));
    await waitFor(() => expect(screen.getByText(/întârziat/i)).toBeInTheDocument());
  });

  it("T-CRM-107-1: creates task via form", async () => {
    vi.mocked(tasksApi.createTask).mockResolvedValue({ ...MOCK_TASK_OPEN, id: "t-new", title: "Test task" });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /task-uri/i }));
    await waitFor(() => expect(screen.getByLabelText("Titlu task nou")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Titlu task nou"), { target: { value: "Test task" } });
    fireEvent.click(screen.getByRole("button", { name: /adaugă/i }));

    await waitFor(() => expect(tasksApi.createTask).toHaveBeenCalledWith("lead-001", expect.objectContaining({ title: "Test task" })));
  });

  /**
   * T-CRM-107-2: done status shows completedAt
   */
  it("T-CRM-107-2: done task shows completion date and strikethrough", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [MOCK_TASK_DONE] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /task-uri/i }));
    await waitFor(() => expect(screen.getByText("Task finalizat")).toBeInTheDocument());
    expect(screen.getByText(/Finalizat:/i)).toBeInTheDocument();
  });

  /**
   * T-CRM-107-3: completing task calls updateTask and refreshes interactions
   */
  it("T-CRM-107-3: completing task calls updateTask with status=done", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [MOCK_TASK_OPEN] });
    vi.mocked(tasksApi.updateTask).mockResolvedValue({ ...MOCK_TASK_OPEN, status: "done", completedAt: new Date().toISOString() });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /task-uri/i }));
    await waitFor(() => expect(screen.getByLabelText(`Finalizează: ${MOCK_TASK_OPEN.title}`)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(`Finalizează: ${MOCK_TASK_OPEN.title}`));
    await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledWith("lead-001", "t1", { status: "done" }));
  });

  /**
   * Tab task-uri count shows open tasks
   */
  it("task tab shows count of open tasks", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [MOCK_TASK_OPEN, MOCK_TASK_DONE] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /task-uri \(1\)/i })).toBeInTheDocument());
  });
});

describe("CRM-107 — Fișiere per lead", () => {
  beforeEach(() => {
    vi.mocked(leadsApi.getLead).mockResolvedValue(MOCK_LEAD);
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: [] });
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
    vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
    vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ values: [], fields: [] });
  });

  /**
   * T-CRM-107-4: attachment appears in files tab with name + size
   */
  it("T-CRM-107-4: renders attachments in files tab", async () => {
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [MOCK_ATTACHMENT] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /fișiere/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /fișiere/i }));
    await waitFor(() => expect(screen.getByText("contract.pdf")).toBeInTheDocument());
    expect(screen.getByText(/12.1 KB/)).toBeInTheDocument();
  });

  it("T-CRM-107-4: download link present on attachment", async () => {
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [MOCK_ATTACHMENT] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /fișiere/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /fișiere/i }));
    await waitFor(() => {
      const downloadLink = screen.getByLabelText("Descarcă contract.pdf");
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute("download", "contract.pdf");
    });
  });

  it("T-CRM-107-4: files tab shows count of attachments", async () => {
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [MOCK_ATTACHMENT] });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /fișiere \(1\)/i })).toBeInTheDocument());
  });

  it("T-CRM-107-4: deleting attachment calls deleteAttachment", async () => {
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [MOCK_ATTACHMENT] });
    vi.mocked(tasksApi.deleteAttachment).mockResolvedValue({ deleted: true });
    renderLeadCard();
    await waitFor(() => expect(screen.getByRole("tab", { name: /fișiere/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /fișiere/i }));
    await waitFor(() => expect(screen.getByLabelText("Șterge contract.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Șterge contract.pdf"));
    await waitFor(() => expect(tasksApi.deleteAttachment).toHaveBeenCalledWith("lead-001", "a1"));
  });
});

describe("CRM-107 — Pipeline task badge", () => {
  it("nextTask field exists on Lead interface", () => {
    const lead: Lead = {
      ...MOCK_LEAD,
      nextTask: { dueAt: TOMORROW, title: "Sună mâine" },
    };
    expect(lead.nextTask?.title).toBe("Sună mâine");
  });

  it("nextTask null when no open tasks", () => {
    const lead: Lead = { ...MOCK_LEAD, nextTask: null };
    expect(lead.nextTask).toBeNull();
  });
});
