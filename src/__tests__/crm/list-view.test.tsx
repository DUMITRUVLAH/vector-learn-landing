/**
 * CRM-117 — Vedere Listă/Tabel
 * Covers T-CRM-117-1..10 (automated part; stage inline change requires user interaction)
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── localStorage mock for jsdom/Node.js 26 compatibility ────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
});

// ─── Mock API calls ───────────────────────────────────────────────────────────
vi.mock("@/lib/api/pipeline", () => ({
  fetchPipelineStages: vi.fn(),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  deletePipelineStage: vi.fn(),
  reorderPipelineStages: vi.fn(),
}));

vi.mock("@/lib/api/leads", () => ({
  fetchPipeline: vi.fn(),
  fetchLeadsList: vi.fn(),
  moveLeadStage: vi.fn(),
  createLead: vi.fn(),
  convertLead: vi.fn(),
  listInteractions: vi.fn(),
  addInteraction: vi.fn(),
  checkDuplicate: vi.fn(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1", role: "owner" } }),
}));

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/leads" }),
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string; className?: string }>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

import * as pipelineApi from "@/lib/api/pipeline";
import * as leadsApi from "@/lib/api/leads";
import type { PipelineStage } from "@/lib/api/pipeline";
import type { Lead, LeadsListResponse } from "@/lib/api/leads";
import { LeadsPage } from "@/pages/app/LeadsPage";

const DEFAULT_STAGES: PipelineStage[] = [
  { id: "s1", tenantId: "t1", key: "new", label: "Lead nou", color: "pastel-sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s2", tenantId: "t1", key: "contacted", label: "Contactat", color: "pastel-lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s3", tenantId: "t1", key: "paid", label: "Client", color: "pastel-mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true, createdAt: "", updatedAt: "" },
  { id: "s4", tenantId: "t1", key: "lost", label: "Pierdut", color: "pastel-rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, createdAt: "", updatedAt: "" },
];

const makeLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "l1", fullName: "Ion Popescu", phone: "0771234567", email: "ion@test.ro",
  stage: "new", source: "facebook_ad", assignedTo: null,
  interestCourse: "Engleză B2", utmSource: null, utmMedium: null, utmCampaign: null,
  notes: null, convertedToStudentId: null, convertedAt: null, lostReason: null,
  score: null, valueCents: 36000, debtCents: 0,
  company: null, dealName: null,
  consentAt: null, consentText: null, ipAtConsent: null, consentRevokedAt: null,
  createdAt: "2026-01-15T10:00:00Z", updatedAt: "2026-01-15T10:00:00Z",
  ...overrides,
});

const makeListResponse = (items: Lead[], overrides: Partial<LeadsListResponse> = {}): LeadsListResponse => ({
  items,
  page: 1,
  pageSize: 50,
  total: items.length,
  totalPages: 1,
  ...overrides,
});

// localStorage helpers (using global mock)
const lsGet = (key: string) => localStorageMock.getItem(key);
const lsSet = (key: string, val: string) => localStorageMock.setItem(key, val);
const lsClear = () => localStorageMock.clear();

beforeEach(() => {
  lsClear();
  // Kanban defaults
  vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: DEFAULT_STAGES });
  vi.mocked(leadsApi.fetchPipeline).mockResolvedValue({
    grouped: { new: [], contacted: [], paid: [], lost: [] },
    counts: { new: 0, contacted: 0, paid: 0, lost: 0 },
    valueSums: {},
    totalValueCents: 0,
  });
  vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(makeListResponse([]));
  vi.mocked(leadsApi.moveLeadStage).mockResolvedValue(makeLead());
});

afterEach(() => {
  lsClear();
});

describe("CRM-117 — Toggle Kanban / Liste", () => {
  it("T-CRM-117-1: toggle switches view to 'list' and persists in localStorage", async () => {
    render(<LeadsPage />);

    // Wait for initial render
    await waitFor(() => screen.getByRole("button", { name: /Vedere Listă/i }));

    const listBtn = screen.getByRole("button", { name: /Vedere Listă/i });
    fireEvent.click(listBtn);

    expect(lsGet("crm_view_mode")).toBe("list");
    // List view API should be called
    await waitFor(() => {
      expect(leadsApi.fetchLeadsList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 50 })
      );
    });
  });

  it("T-CRM-117-2: restores 'list' mode from localStorage on mount", async () => {
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);

    await waitFor(() => {
      expect(leadsApi.fetchLeadsList).toHaveBeenCalled();
    });
  });

  it("toggle back to kanban works", async () => {
    lsSet("crm_view_mode", "list");
    render(<LeadsPage />);

    await waitFor(() => screen.getByRole("button", { name: /Vedere Kanban/i }));
    const kanbanBtn = screen.getByRole("button", { name: /Vedere Kanban/i });
    fireEvent.click(kanbanBtn);

    expect(lsGet("crm_view_mode")).toBe("kanban");
  });
});

describe("CRM-117 — List view rendering", () => {
  it("T-CRM-117-4: shows correct items and pagination info", async () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      makeLead({ id: `lead-${i}`, fullName: `Lead ${i}` })
    );
    vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(
      makeListResponse(items, { total: 100, totalPages: 2, page: 1, pageSize: 50 })
    );
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);

    await waitFor(() => screen.getByText("Lead 0"));
    expect(screen.getByText("Lead 0")).toBeInTheDocument();
    expect(screen.getByText("Lead 49")).toBeInTheDocument();

    // Pagination info
    expect(screen.getByText(/1–50 din 100 leaduri/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it("T-CRM-117-5: click on sort header calls onSort with correct args", async () => {
    vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(
      makeListResponse([makeLead()], { total: 1, totalPages: 1 })
    );
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);
    await waitFor(() => screen.getByText("Ion Popescu"));

    // Click sort header "Valoare"
    const sortBtn = screen.getByRole("button", { name: /Sortează după valueCents/i });
    fireEvent.click(sortBtn);

    await waitFor(() => {
      expect(leadsApi.fetchLeadsList).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "valueCents", dir: "asc" })
      );
    });
  });

  it("T-CRM-117-8: row click navigates to lead detail", async () => {
    vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(
      makeListResponse([makeLead({ id: "l-abc" })])
    );
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);
    await waitFor(() => screen.getByText("Ion Popescu"));

    const row = screen.getByText("Ion Popescu").closest("tr")!;
    fireEvent.click(row);

    expect(mockNavigate).toHaveBeenCalledWith("/app/leads/l-abc");
  });

  it("T-CRM-117-10: shows empty state when no items returned", async () => {
    vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(makeListResponse([]));
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);
    await waitFor(() => screen.getByText(/Niciun lead găsit/));

    expect(screen.getByText(/Niciun lead găsit/)).toBeInTheDocument();
  });

  it("T-CRM-117-4: pagination next page button triggers correct page fetch", async () => {
    const items = Array.from({ length: 50 }, (_, i) => makeLead({ id: `l-${i}`, fullName: `Lead ${i}` }));
    vi.mocked(leadsApi.fetchLeadsList).mockResolvedValue(
      makeListResponse(items, { total: 100, totalPages: 2, page: 1, pageSize: 50 })
    );
    lsSet("crm_view_mode", "list");

    render(<LeadsPage />);
    await waitFor(() => screen.getByText("Lead 0"));

    const nextBtn = screen.getByRole("button", { name: /Pagina următoare/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(leadsApi.fetchLeadsList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });
});

describe("CRM-117 — API contract", () => {
  it("T-CRM-117-3: fetchLeadsList sends view=list param", async () => {
    lsSet("crm_view_mode", "list");
    render(<LeadsPage />);

    await waitFor(() => {
      expect(leadsApi.fetchLeadsList).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 50 })
      );
    });
  });
});
