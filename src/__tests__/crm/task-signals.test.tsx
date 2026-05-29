/**
 * CRM-116 — Semnale de task pe card (Fără task + aging restanță + filtre)
 * Covers T-CRM-116-1..4
 *
 * T-CRM-116-1: lead fără task open → badge "Fără task" (warning)
 * T-CRM-116-2: task open scadent 75 zile → badge "75d" roșu
 * T-CRM-116-3: task open mâine → data, nu badge roșu
 * T-CRM-116-4: filtru "fără task" → se afișează doar leaduri fără task open
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
  moveLeadStage: vi.fn(),
  createLead: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  checkDuplicate: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/leads" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

import * as pipelineApi from "@/lib/api/pipeline";
import * as leadsApi from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import type { Lead, PipelineResponse } from "@/lib/api/leads";
import { LeadsPage } from "@/pages/app/LeadsPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s2", tenantId: "t1", key: "contacted", label: "Contactat", color: "pastel-lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s3", tenantId: "t1", key: "trial", label: "Trial / Demo", color: "pastel-peach", orderIndex: 2, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s4", tenantId: "t1", key: "paid", label: "Client", color: "pastel-mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s5", tenantId: "t1", key: "lost", label: "Pierdut", color: "pastel-rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, createdAt: "", updatedAt: "" },
];

const YESTERDAY = new Date(Date.now() - 86400000).toISOString();
const TOMORROW = new Date(Date.now() + 86400000).toISOString();
const OVERDUE_75D = new Date(Date.now() - 75 * 86400000).toISOString();

const BASE = {
  phone: "+40771234567", email: "t@t.ro", interestCourse: "Test",
  source: "manual" as const, utmSource: null, utmMedium: null, utmCampaign: null,
  notes: null, assignedTo: null, consentAt: null, consentText: null,
  ipAtConsent: null, consentRevokedAt: null, convertedToStudentId: null,
  convertedAt: null, lostReason: null, valueCents: 0, debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const makeLead = (overrides: Partial<Lead>): Lead => ({
  id: "l1", fullName: "Test Lead", stage: "new", ...BASE, ...overrides,
});

function makePipelineResponse(leads: Lead[]): PipelineResponse {
  const grouped: Record<string, Lead[]> = {
    new: [], contacted: [], trial: [], paid: [], lost: [],
  };
  for (const l of leads) { (grouped[l.stage] ??= []).push(l); }
  const counts = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
  const valueSums = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.reduce((s, l) => s + l.valueCents, 0)]));
  return { grouped, counts, valueSums, totalValueCents: 0 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CRM-116 — Task signals on kanban card", () => {
  beforeEach(() => {
    vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: DEFAULT_STAGES });
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
  });

  /**
   * T-CRM-116-1: lead fără task open → badge "Fără task" (warning)
   */
  it("T-CRM-116-1: lead fără task → badge 'Fără task'", async () => {
    const lead = makeLead({ id: "l1", stage: "new", nextTask: null });
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipelineResponse([lead]));

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText("Fără task")).toBeDefined();
    });
  });

  /**
   * T-CRM-116-2: task scadent 75 zile → badge "75d" roșu
   */
  it("T-CRM-116-2: task overdue 75 zile → badge '75d'", async () => {
    const lead = makeLead({
      id: "l1", stage: "new",
      nextTask: { dueAt: OVERDUE_75D, title: "Sună" },
    });
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipelineResponse([lead]));

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText("75d")).toBeDefined();
    });
  });

  /**
   * T-CRM-116-3: task mâine → data (nu roșu, nu badge "Fără task" pe card)
   */
  it("T-CRM-116-3: task mâine → arată data, nu badge aging roșu", async () => {
    const lead = makeLead({
      id: "l1", stage: "new",
      nextTask: { dueAt: TOMORROW, title: "Follow-up" },
    });
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipelineResponse([lead]));

    render(<LeadsPage />);

    await waitFor(() => {
      // No "75d" overdue badge
      expect(screen.queryByText(/^\d+d$/)).toBeNull();
      // The card itself shouldn't have the "Fără task" badge — it should have a date instead
      // (Filter label "Fără task" is in the bar but not the card badge which uses aria-label)
      const faraBadges = screen.queryAllByLabelText("Lead fără task deschis");
      expect(faraBadges).toHaveLength(0);
    });
  });

  /**
   * T-CRM-116-4: filtru "fără task" → se afișează doar leaduri fără task
   */
  it("T-CRM-116-4: filtru 'fără task' afișează doar leaduri fără task", async () => {
    const leadWithTask = makeLead({
      id: "l1", stage: "new", fullName: "Cu Task",
      nextTask: { dueAt: TOMORROW, title: "Sună" },
    });
    const leadNoTask = makeLead({
      id: "l2", stage: "new", fullName: "Fara Task",
      nextTask: null,
    });
    vi.mocked(leadsApi.fetchPipeline).mockResolvedValue(makePipelineResponse([leadWithTask, leadNoTask]));

    render(<LeadsPage />);

    // Initially both should be visible
    await waitFor(() => {
      expect(screen.getByText("Cu Task")).toBeDefined();
      expect(screen.getByText("Fara Task")).toBeDefined();
    });

    // Click "Fără task" filter checkbox
    const checkbox = screen.getByRole("checkbox", { name: /Filtrează leaduri fără task/i });
    fireEvent.click(checkbox);

    await waitFor(() => {
      // Lead with task should no longer appear
      expect(screen.queryByText("Cu Task")).toBeNull();
      // Lead without task should still appear
      expect(screen.getByText("Fara Task")).toBeDefined();
    });
  });
});

// ─── Pure logic tests ─────────────────────────────────────────────────────────

describe("CRM-116 — Task aging logic", () => {
  it("calculates days overdue correctly for 75 days", () => {
    const dueAt = new Date(Date.now() - 75 * 86400000);
    const daysOverdue = Math.floor((Date.now() - dueAt.getTime()) / 86400000);
    expect(daysOverdue).toBe(75);
  });

  it("task due tomorrow is not overdue", () => {
    const dueAt = new Date(Date.now() + 86400000);
    const isOverdue = dueAt < new Date();
    expect(isOverdue).toBe(false);
  });

  it("task due yesterday is overdue", () => {
    const dueAt = new Date(Date.now() - 86400000);
    const isOverdue = dueAt < new Date();
    expect(isOverdue).toBe(true);
  });

  it("null nextTask means no open task (Fără task condition)", () => {
    const nextTask = null;
    const showFaraTasks = nextTask === null;
    expect(showFaraTasks).toBe(true);
  });
});
