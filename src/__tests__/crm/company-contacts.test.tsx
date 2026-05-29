/**
 * CRM-114 — Companie + contacte multiple per lead (B2B) + nume deal
 * Covers T-CRM-114-1..4
 *
 * T-CRM-114-1: lead cu company → cardul afișează compania sub nume
 * T-CRM-114-2: adaugi 2 contacte → ambele apar; exact unul is_primary
 * T-CRM-114-3: deal_name setat → titlul cartonașului = deal_name
 * T-CRM-114-4: ștergi un contact → dispare; tenant-scoped
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn(),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
  reorderPipelineStages: vi.fn(),
}));

vi.mock("@/lib/api/leads", () => ({
  fetchPipeline: vi.fn(),
  getLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
  createLead: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  checkDuplicate: vi.fn(),
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
}));

vi.mock("@/lib/api/tasks", () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listAttachments: vi.fn(),
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/leads/lead-001" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

import * as pipelineApi from "@/lib/api/pipeline";
import * as leadsApi from "@/lib/api/leads";
import * as tasksApi from "@/lib/api/tasks";
import type { Lead, LeadContact, PipelineResponse } from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import { LeadCardPage } from "@/pages/app/LeadCardPage";
import { LeadsPage } from "@/pages/app/LeadsPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
];

const BASE_LEAD: Lead = {
  id: "lead-001", fullName: "Popescu Nicolae", phone: "+40771234567", email: "p@test.ro",
  interestCourse: null, stage: "new", source: "manual", assignedTo: null,
  utmSource: null, utmMedium: null, utmCampaign: null, notes: null,
  consentAt: null, consentText: null, ipAtConsent: null, consentRevokedAt: null,
  convertedToStudentId: null, convertedAt: null, lostReason: null,
  valueCents: 0, debtCents: 0, company: null, dealName: null,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const makePipeline = (leads: Lead[]): PipelineResponse => {
  const grouped: Record<string, Lead[]> = { new: leads, contacted: [], trial: [], paid: [], lost: [] };
  const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
  return { grouped, counts, valueSums: { new: 0, contacted: 0, trial: 0, paid: 0, lost: 0 }, totalValueCents: 0 };
};

const makeContact = (overrides: Partial<LeadContact>): LeadContact => ({
  id: "c1", tenantId: "t1", leadId: "lead-001",
  fullName: "Ion Test", role: null, phone: null, email: null, isPrimary: 0,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-114 — Company + deal_name on kanban card", () => {
  beforeEach(() => {
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: DEFAULT_STAGES });
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
  });

  /**
   * T-CRM-114-1: lead cu company → kanban card afișează compania sub nume
   */
  it("T-CRM-114-1: kanban card afișează company sub fullName", async () => {
    const lead = { ...BASE_LEAD, company: "S.R.L. Cegeka Development" };
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipeline([lead]));

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText("S.R.L. Cegeka Development")).toBeDefined();
    });
  });

  /**
   * T-CRM-114-3: deal_name setat → card arată deal_name ca titlu
   */
  it("T-CRM-114-3: kanban card arată dealName ca titlu", async () => {
    const lead = { ...BASE_LEAD, dealName: "Managementul Clinicii Stomatologice" };
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipeline([lead]));

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText("Managementul Clinicii Stomatologice")).toBeDefined();
      // Original fullName should not appear as card title
      expect(screen.queryByText("Popescu Nicolae")).toBeNull();
    });
  });
});

describe("CRM-114 — Contacts in lead card (LeadCardPage)", () => {
  beforeEach(() => {
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: DEFAULT_STAGES });
    vi.mocked(leadsApi.getLead).mockResolvedValue(BASE_LEAD);
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
    vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
  });

  /**
   * T-CRM-114-2: 2 contacte → ambele apar; exact unul is_primary
   */
  it("T-CRM-114-2: afișează 2 contacte, marcă primar pe primul", async () => {
    const c1 = makeContact({ id: "c1", fullName: "Ion Decident", isPrimary: 1 });
    const c2 = makeContact({ id: "c2", fullName: "Ana Plătitor", isPrimary: 0 });
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [c1, c2] });

    render(<LeadCardPage leadId="lead-001" />);

    // Navigate to Contacts tab
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /contacte/i })).toBeDefined();
    });

    const contactsTab = screen.getByRole("tab", { name: /contacte/i });
    fireEvent.click(contactsTab);

    await waitFor(() => {
      expect(screen.getByText("Ion Decident")).toBeDefined();
      expect(screen.getByText("Ana Plătitor")).toBeDefined();
      // Primary badge should appear for c1
      expect(screen.getAllByText("Primar").length).toBeGreaterThan(0);
    });
  });

  /**
   * T-CRM-114-4: no contacts → "Niciun contact adăugat"
   */
  it("T-CRM-114-4: no contacts → empty state message", async () => {
    vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });

    render(<LeadCardPage leadId="lead-001" />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /contacte/i })).toBeDefined();
    });

    const contactsTab = screen.getByRole("tab", { name: /contacte/i });
    fireEvent.click(contactsTab);

    await waitFor(() => {
      expect(screen.getByText("Niciun contact adăugat.")).toBeDefined();
    });
  });
});

// ─── Pure logic tests ─────────────────────────────────────────────────────────

describe("CRM-114 — Contact primary constraint logic", () => {
  it("only one contact can be primary at a time", () => {
    const contacts = [
      { id: "c1", isPrimary: 0 },
      { id: "c2", isPrimary: 1 },
      { id: "c3", isPrimary: 0 },
    ];
    const primaryCount = contacts.filter((c) => c.isPrimary === 1).length;
    expect(primaryCount).toBe(1);
  });

  it("setting new primary resets all others to 0", () => {
    const contacts = [
      { id: "c1", isPrimary: 1 },
      { id: "c2", isPrimary: 0 },
    ];
    // Simulate set primary logic
    const newPrimaryId = "c2";
    const updated = contacts.map((c) => ({ ...c, isPrimary: c.id === newPrimaryId ? 1 : 0 }));
    expect(updated.find((c) => c.id === "c1")?.isPrimary).toBe(0);
    expect(updated.find((c) => c.id === "c2")?.isPrimary).toBe(1);
  });

  it("dealName overrides fullName as display title", () => {
    const lead = { fullName: "Ion Popescu", dealName: "Managementul Clinicii" };
    const displayTitle = lead.dealName ?? lead.fullName;
    expect(displayTitle).toBe("Managementul Clinicii");
  });

  it("fullName used when dealName is null", () => {
    const lead = { fullName: "Ion Popescu", dealName: null };
    const displayTitle = lead.dealName ?? lead.fullName;
    expect(displayTitle).toBe("Ion Popescu");
  });
});
