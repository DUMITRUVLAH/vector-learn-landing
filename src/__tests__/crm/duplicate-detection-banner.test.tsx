/**
 * CRM-133 — Duplicate detection banner + MergeLeadModal
 * Tests: T-CRM-133-1..5
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mock API ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/leads", () => ({
  getLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
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
  scoreLead: vi.fn(),
  getDedupBanner: vi.fn(),
  mergeLead: vi.fn(),
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
  useSession: () => ({ status: "authenticated", user: { id: "u1", name: "Test", email: "test@test.com", role: "admin" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), params: {} }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/crm/CommModal", () => ({
  SendMessageModal: () => null,
  LogCallModal: () => null,
}));

vi.mock("@/components/crm/ConvertModal", () => ({
  ConvertModal: () => null,
  getScoreBadge: () => "warm",
  SCORE_BADGE_STYLES: { warm: "" },
  SCORE_BADGE_LABELS: { warm: "Cald" },
}));

import { LeadCardPage } from "@/pages/app/LeadCardPage";
import * as leadsApi from "@/lib/api/leads";
import * as pipelineApi from "@/lib/api/pipeline";
import * as tasksApi from "@/lib/api/tasks";

import { MergeLeadModal } from "@/components/crm/MergeLeadModal";

// ─── Test data ────────────────────────────────────────────────────────────────

const mockLead = {
  id: "lead-1",
  fullName: "Ion Popescu",
  phone: "0700000001",
  email: "ion@test.com",
  source: "manual" as const,
  stage: "new",
  score: null,
  assignedTo: null,
  notes: null,
  valueCents: 0,
  debtCents: 0,
  company: null,
  dealName: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  consentAt: "2026-01-01T00:00:00Z",
  ipAtConsent: null,
  consentText: null,
  consentRevokedAt: null,
  convertedToStudentId: null,
  convertedAt: null,
  lostReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  interestCourse: "Engleză B2",
};

const mockDuplicate = {
  ...mockLead,
  id: "lead-dup-1",
  fullName: "Ion Popescu (dup)",
  stage: "contacted",
  createdAt: "2026-01-15T00:00:00Z",
  updatedAt: "2026-01-15T00:00:00Z",
};

const mockStages = [
  {
    id: "stage-1",
    tenantId: "t1",
    key: "new",
    label: "Nou",
    color: "bg-blue-100",
    orderIndex: 1,
    isWon: false,
    isLost: false,
    isDefault: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

function setupBaseMocks() {
  vi.mocked(leadsApi.getLead).mockResolvedValue(mockLead);
  vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: mockStages });
  vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
  vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
  vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
  vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
  vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
  vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ fields: [], values: [] });
  // CRM-145 auto-score fires on mount when lead.score == null; mock a realistic response
  // so the score effect doesn't crash before the dedup banner renders.
  vi.mocked(leadsApi.scoreLead).mockResolvedValue({
    lead: mockLead,
    score: 42,
    badge: "warm",
    factors: [],
  });
}

// ─── T-CRM-133-1: Banner shown when duplicates exist ─────────────────────────

describe("LeadCardPage — CRM-133 duplicate detection banner", () => {
  beforeEach(() => {
    setupBaseMocks();
  });

  it("T-CRM-133-1 [blocant] banner appears when dedup-check returns duplicates", async () => {
    vi.mocked(leadsApi.getDedupBanner).mockResolvedValue({ duplicates: [mockDuplicate] });

    render(<LeadCardPage leadId="lead-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Posibil duplicat/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Ion Popescu (dup)")).toBeInTheDocument();
  });

  it("T-CRM-133-2 [blocant] banner NOT shown when dedup-check returns empty", async () => {
    vi.mocked(leadsApi.getDedupBanner).mockResolvedValue({ duplicates: [] });

    render(<LeadCardPage leadId="lead-1" />);

    // Wait for page to load (Overview is the default tab)
    await screen.findByRole("tab", { name: "Overview" });

    expect(screen.queryByText(/Posibil duplicat/i)).toBeNull();
  });

  it("T-CRM-133-3 [blocant] banner NOT shown when dedup-check rejects", async () => {
    vi.mocked(leadsApi.getDedupBanner).mockRejectedValue(new Error("Network error"));

    render(<LeadCardPage leadId="lead-1" />);

    await screen.findByRole("tab", { name: "Overview" });

    expect(screen.queryByText(/Posibil duplicat/i)).toBeNull();
  });

  it("T-CRM-133-4 [blocant] clicking Fuzionează opens MergeLeadModal with 2 radio options", async () => {
    vi.mocked(leadsApi.getDedupBanner).mockResolvedValue({ duplicates: [mockDuplicate] });

    render(<LeadCardPage leadId="lead-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Posibil duplicat/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Fuzionează/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Fuzionare leaduri" })).toBeInTheDocument();
    });

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });
});

// ─── T-CRM-133-5: MergeLeadModal calls merge API ─────────────────────────────

describe("MergeLeadModal", () => {
  it("T-CRM-133-5 confirm merge calls mergeLead once with correct args", async () => {
    vi.mocked(leadsApi.mergeLead).mockResolvedValue({
      merged: true,
      keptLead: mockLead,
    });

    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <MergeLeadModal
        currentLead={mockLead}
        duplicateLead={mockDuplicate}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    // Default: keep current lead
    const confirmBtn = screen.getByRole("button", { name: /Confirmă fuzionarea/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(leadsApi.mergeLead).toHaveBeenCalledOnce();
      expect(leadsApi.mergeLead).toHaveBeenCalledWith("lead-1", {
        mergeWithId: "lead-dup-1",
        keepId: "lead-1",
      });
      expect(onSuccess).toHaveBeenCalledWith(mockLead);
    });
  });

  it("MergeLeadModal renders 2 radio options with lead names", () => {
    render(
      <MergeLeadModal
        currentLead={mockLead}
        duplicateLead={mockDuplicate}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // "Ion Popescu" appears in the radiogroup label and in the summary box — use getAllByText
    expect(screen.getAllByText("Ion Popescu").length).toBeGreaterThanOrEqual(1);
    // "Ion Popescu (dup)" appears in radiogroup label and summary
    expect(screen.getAllByText("Ion Popescu (dup)").length).toBeGreaterThanOrEqual(1);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });
});
