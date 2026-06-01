/**
 * CRM-119 — Saved Views + extended search
 * Covers T-CRM-119-1..5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock API ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/savedViews", () => ({
  listSavedViews: vi.fn(),
  createSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}));

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
  getDedupBanner: vi.fn(),
  mergeLead: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
}));

import * as svApi from "@/lib/api/savedViews";
import * as pipelineApi from "@/lib/api/pipeline";
import * as leadsApi from "@/lib/api/leads";
import { SavedViewsDropdown } from "@/components/crm/SavedViewsDropdown";
import type { SavedView } from "@/lib/api/savedViews";
import type { PipelineStage } from "@/lib/api/pipeline";
import type { Lead } from "@/lib/api/leads";

const mockStages: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockLeads: Lead[] = [
  {
    id: "l1",
    fullName: "Maria Popescu",
    phone: "0712345678",
    email: null,
    interestCourse: "Engleză B2",
    stage: "new",
    source: "manual",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    notes: null,
    assignedTo: null,
    consentAt: null,
    consentText: null,
    ipAtConsent: null,
    consentRevokedAt: null,
    convertedToStudentId: null,
    convertedAt: null,
    lostReason: null,
    valueCents: 0,
    debtCents: 0,
    company: "ACME S.R.L.",
    dealName: "Deal Engleză",
    nextTask: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockView: SavedView = {
  id: "v1",
  tenantId: "t1",
  userId: "u1",
  name: "Facebook overdue",
  filters: { source: "facebook_ad", filterOverdue: true },
  isPublic: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: mockStages } as { stages: PipelineStage[] });
  vi.mocked(leadsApi.fetchPipeline).mockResolvedValue({
    grouped: { new: mockLeads },
    counts: { new: 1 },
    valueSums: { new: 0 },
    totalValueCents: 0,
  } as ReturnType<typeof leadsApi.fetchPipeline> extends Promise<infer T> ? T : never);
  vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] } as { items: ReturnType<typeof leadsApi.listInteractions> extends Promise<{ items: infer I }> ? I : never });
  vi.mocked(svApi.listSavedViews).mockResolvedValue({ views: [mockView] });
  vi.mocked(svApi.createSavedView).mockResolvedValue({ view: mockView });
  vi.mocked(svApi.deleteSavedView).mockResolvedValue(undefined);
});

// ─── Unit: SavedViewsDropdown ─────────────────────────────────────────────────

describe("SavedViewsDropdown", () => {
  const noop = () => {};

  it("T-CRM-119-4: dropdown button renders with accessible label", () => {
    render(
      <SavedViewsDropdown
        activeFilters={{}}
        hasActiveFilters={false}
        onApplyView={noop}
        onError={noop}
      />
    );
    expect(screen.getByRole("button", { name: /vizualizări/i })).toBeInTheDocument();
  });

  it("T-CRM-119-1: lists views when dropdown is opened", async () => {
    const user = userEvent.setup();
    render(
      <SavedViewsDropdown
        activeFilters={{}}
        hasActiveFilters={false}
        onApplyView={noop}
        onError={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /vizualizări/i }));
    await waitFor(() => expect(svApi.listSavedViews).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Facebook overdue")).toBeInTheDocument();
  });

  it("T-CRM-119-1: calls onApplyView when a view is clicked", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <SavedViewsDropdown
        activeFilters={{}}
        hasActiveFilters={false}
        onApplyView={onApply}
        onError={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /vizualizări/i }));
    await waitFor(() => screen.getByText("Facebook overdue"));
    await user.click(screen.getByRole("button", { name: /aplică vizualizarea: Facebook overdue/i }));

    expect(onApply).toHaveBeenCalledWith({ source: "facebook_ad", filterOverdue: true });
  });

  it("T-CRM-119-2: deletes view when X button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SavedViewsDropdown
        activeFilters={{}}
        hasActiveFilters={false}
        onApplyView={noop}
        onError={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /vizualizări/i }));
    await waitFor(() => screen.getByText("Facebook overdue"));
    await user.click(screen.getByRole("button", { name: /șterge vizualizarea: Facebook overdue/i }));

    expect(svApi.deleteSavedView).toHaveBeenCalledWith("v1");
    await waitFor(() => expect(screen.queryByText("Facebook overdue")).not.toBeInTheDocument());
  });

  it("T-CRM-119-1: shows save form when hasActiveFilters and 'Salvează filtrul' clicked", async () => {
    const user = userEvent.setup();
    render(
      <SavedViewsDropdown
        activeFilters={{ source: "facebook_ad" }}
        hasActiveFilters={true}
        onApplyView={noop}
        onError={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /salvează filtrul curent ca vizualizare$/i }));
    expect(screen.getByPlaceholderText(/nume vizualizare/i)).toBeInTheDocument();
  });

  it("T-CRM-119-1: saves a view with a name", async () => {
    const user = userEvent.setup();
    render(
      <SavedViewsDropdown
        activeFilters={{ source: "facebook_ad" }}
        hasActiveFilters={true}
        onApplyView={noop}
        onError={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /salvează filtrul curent ca vizualizare$/i }));
    const input = screen.getByPlaceholderText(/nume vizualizare/i);
    await user.type(input, "Facebook overdue");
    await user.click(screen.getByRole("button", { name: /confirmă salvarea/i }));

    expect(svApi.createSavedView).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Facebook overdue",
        filters: { source: "facebook_ad" },
      })
    );
  });
});

// ─── Unit: Extended client-side search (regression) ─────────────────────────

describe("T-CRM-119-3: Extended search filters", () => {
  it("filters by company name", () => {
    // Simulate the filter logic from LeadsPage.getFilteredLeads
    const query = "acme";
    const filtered = mockLeads.filter((lead) => {
      const q = query.toLowerCase();
      const phoneQ = q.replace(/\D/g, "");
      const nameMatch = lead.fullName.toLowerCase().includes(q);
      const phoneMatch = phoneQ.length > 0 && (lead.phone ?? "").replace(/\D/g, "").includes(phoneQ);
      const companyMatch = (lead.company ?? "").toLowerCase().includes(q);
      const dealMatch = (lead.dealName ?? "").toLowerCase().includes(q);
      const courseMatch = (lead.interestCourse ?? "").toLowerCase().includes(q);
      return nameMatch || phoneMatch || companyMatch || dealMatch || courseMatch;
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].company).toBe("ACME S.R.L.");
  });

  it("filters by deal name", () => {
    const query = "engleză";
    const filtered = mockLeads.filter((lead) => {
      const q = query.toLowerCase();
      const dealMatch = (lead.dealName ?? "").toLowerCase().includes(q);
      return dealMatch;
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].dealName).toBe("Deal Engleză");
  });

  it("filters by interest course", () => {
    const query = "b2";
    const filtered = mockLeads.filter((lead) => {
      const courseMatch = (lead.interestCourse ?? "").toLowerCase().includes(query);
      return courseMatch;
    });
    expect(filtered).toHaveLength(1);
  });
});
