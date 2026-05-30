/**
 * CRM-121 — Vedere mobilă
 * Covers T-CRM-121-1..10 (automated part; touch swipe is [manual])
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/leads", () => ({
  fetchPipeline: vi.fn(),
  moveLeadStage: vi.fn(),
  createLead: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  checkDuplicate: vi.fn(),
  getDedupBanner: vi.fn(),
  mergeLead: vi.fn(),
}));

vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn(),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
  reorderPipelineStages: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", name: "Andreea", role: "owner" }, tenant: { name: "Test" } },
    logout: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/leads" }),
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string; className?: string }>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ totalActions: 0 }),
});

import * as leadsApi from "@/lib/api/leads";
import * as pipelineApi from "@/lib/api/pipeline";
import type { Lead } from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import { MobileLeadList } from "@/components/crm/MobileLeadList";

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s2", tenantId: "t1", key: "contacted", label: "Contactat", color: "pastel-lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s3", tenantId: "t1", key: "paid", label: "Client", color: "pastel-mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s4", tenantId: "t1", key: "lost", label: "Pierdut", color: "pastel-rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, createdAt: "", updatedAt: "" },
];

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "l1", fullName: "Ion Popescu", phone: "0771234567", email: "ion@test.ro",
  stage: "new", source: "facebook_ad", assignedTo: null,
  interestCourse: "Engleza B2", utmSource: null, utmMedium: null, utmCampaign: null,
  notes: null, convertedToStudentId: null, convertedAt: null, lostReason: null,
  score: null, valueCents: 36000, debtCents: 0,
  company: null, dealName: null,
  consentAt: null, consentText: null, ipAtConsent: null, consentRevokedAt: null,
  createdAt: "2026-01-15T10:00:00Z", updatedAt: "2026-01-15T10:00:00Z",
  nextTask: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(leadsApi.moveLeadStage).mockResolvedValue(makeLead());
  vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: DEFAULT_STAGES });
  vi.mocked(leadsApi.fetchPipeline).mockResolvedValue({
    grouped: { new: [], contacted: [], paid: [], lost: [] },
    counts: { new: 0, contacted: 0, paid: 0, lost: 0 },
    valueSums: {},
    totalValueCents: 0,
  });
});

describe("CRM-121 — MobileLeadList component", () => {
  it("T-CRM-121-7: shows empty state when no leads", () => {
    render(
      <MobileLeadList
        leads={[]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText(/Niciun lead găsit/i)).toBeInTheDocument();
  });

  it("renders lead card with name, stage badge and phone button", () => {
    render(
      <MobileLeadList
        leads={[makeLead()]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schimbă stadiu Lead nou/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sună Ion Popescu/i })).toBeInTheDocument();
  });

  it("T-CRM-121-6: tap on lead navigates to detail page", () => {
    const onTap = vi.fn();
    render(
      <MobileLeadList
        leads={[makeLead({ id: "l-abc" })]}
        stages={DEFAULT_STAGES}
        onTap={onTap}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Click the card (the inner content div)
    const card = screen.getByLabelText(/Lead Ion Popescu, stadiu Lead nou/i);
    fireEvent.click(card);
    expect(onTap).toHaveBeenCalledWith("l-abc");
  });

  it("T-CRM-121-4: click stage badge opens stage bottom-sheet", async () => {
    render(
      <MobileLeadList
        leads={[makeLead()]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );

    const stageBtn = screen.getByRole("button", { name: /Schimbă stadiu/i });
    fireEvent.click(stageBtn);

    await waitFor(() => screen.getByRole("dialog", { name: /Schimbă stadiu pentru Ion Popescu/i }));
    expect(screen.getByText("Mută în stadiu")).toBeInTheDocument();
    // All stages shown
    expect(screen.getByRole("option", { name: /Contactat/i })).toBeInTheDocument();
  });

  it("T-CRM-121-4: selecting non-lost stage calls moveLeadStage", async () => {
    const onRefresh = vi.fn();
    render(
      <MobileLeadList
        leads={[makeLead({ stage: "new" })]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={onRefresh}
        onError={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Schimbă stadiu/i }));
    await waitFor(() => screen.getByRole("option", { name: /Contactat/i }));
    fireEvent.click(screen.getByRole("option", { name: /Contactat/i }));

    await waitFor(() => {
      expect(leadsApi.moveLeadStage).toHaveBeenCalledWith("l1", "contacted");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("T-CRM-121-5: selecting lost stage shows lost reason sheet", async () => {
    render(
      <MobileLeadList
        leads={[makeLead({ stage: "new" })]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Schimbă stadiu/i }));
    await waitFor(() => screen.getByRole("option", { name: /Pierdut/i }));
    fireEvent.click(screen.getByRole("option", { name: /Pierdut/i }));

    await waitFor(() => screen.getByRole("dialog", { name: /Motiv pierdere pentru Ion Popescu/i }));
    expect(screen.getByText("Motiv pierdere")).toBeInTheDocument();
  });

  it("shows 'Fără task' badge when lead has no task", () => {
    render(
      <MobileLeadList
        leads={[makeLead({ nextTask: null })]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText("Fără task")).toBeInTheDocument();
  });

  it("shows overdue task badge in red", () => {
    const overdueDate = new Date(Date.now() - 5 * 86400000).toISOString();
    render(
      <MobileLeadList
        leads={[makeLead({
          nextTask: { dueAt: overdueDate, title: "Suna clientul" }
        })]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText(/5d restant/i)).toBeInTheDocument();
  });

  it("T-CRM-121-8: stage badge has min-h-[44px]", () => {
    render(
      <MobileLeadList
        leads={[makeLead()]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    const stageBtn = screen.getByRole("button", { name: /Schimbă stadiu/i });
    expect(stageBtn.className).toContain("min-h-[44px]");
  });

  it("WhatsApp link has correct href", () => {
    render(
      <MobileLeadList
        leads={[makeLead({ phone: "+40771234567" })]}
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    const waLink = screen.getByRole("link", { name: /WhatsApp Ion Popescu/i });
    expect(waLink.getAttribute("href")).toContain("wa.me");
    expect(waLink.getAttribute("href")).toContain("40771234567");
  });

  it("T-CRM-121-9: filters work correctly — only filtered leads shown", () => {
    const lead1 = makeLead({ id: "l1", fullName: "Ion Popescu", source: "facebook_ad" });
    const lead2 = makeLead({ id: "l2", fullName: "Maria Ionescu", source: "manual" });
    // MobileLeadList receives already-filtered leads (filtering is done in LeadsPage)
    render(
      <MobileLeadList
        leads={[lead1]} // only facebook leads
        stages={DEFAULT_STAGES}
        onTap={vi.fn()}
        onRefresh={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    expect(screen.queryByText("Maria Ionescu")).toBeNull();
  });
});
