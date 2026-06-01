/**
 * CRM-120 — Dashboard „Azi" per vânzător
 * Covers T-CRM-120-1..10 (automated part)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/leads", () => ({
  fetchTodayDashboard: vi.fn(),
  fetchPipeline: vi.fn(),
  fetchLeadsList: vi.fn(),
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
    data: { user: { id: "u1", name: "Andreea", role: "owner" }, tenant: { name: "Test Academy" } },
    logout: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/leads/today" }),
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string; className?: string }>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

// Mock fetch for the AppShell today counter
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ totalActions: 3 }),
});

import * as leadsApi from "@/lib/api/leads";
import type { TodayDashboardResponse } from "@/lib/api/leads";
import { TodayDashboardPage } from "@/pages/app/TodayDashboardPage";

const emptyResponse: TodayDashboardResponse = {
  overdueOrDueToday: [],
  newUncontacted: [],
  followUpNeeded: [],
  nextBestAction: [],
  totalActions: 0,
};

const sampleResponse: TodayDashboardResponse = {
  overdueOrDueToday: [
    {
      taskId: "t1",
      taskTitle: "Suna clientul",
      dueAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
      leadId: "l1",
      leadFullName: "Ion Popescu",
      leadStage: "contacted",
      leadPhone: "0771234567",
      leadInterestCourse: "Engleza B2",
      leadValueCents: 36000,
    },
  ],
  newUncontacted: [
    {
      id: "l2",
      fullName: "Maria Ionescu",
      stage: "new",
      source: "facebook_ad",
      phone: "0770000001",
      interestCourse: "Chitara",
      valueCents: 0,
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
      reason: "Nou, necontactat",
    },
  ],
  followUpNeeded: [
    {
      id: "l3",
      fullName: "Ana Dumitrescu",
      stage: "contacted",
      phone: null,
      interestCourse: "Piano",
      valueCents: 18000,
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(), // 3 days ago
      reason: "Fără contact 3z",
    },
  ],
  nextBestAction: [
    {
      id: "l4",
      fullName: "Petre Constantinescu",
      stage: "trial",
      phone: "0770000002",
      interestCourse: "Programare",
      valueCents: 72000,
      score: 75,
      ageDays: 5,
    },
  ],
  totalActions: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue(emptyResponse);
});

describe("CRM-120 — Dashboard Azi rendering", () => {
  it("T-CRM-120-8: shows loading then empty state when no actions", async () => {
    render(<TodayDashboardPage />);

    // Shows loader first
    expect(screen.getByText(/Se încarcă acțiunile de azi/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Tot e la zi/i)).toBeInTheDocument();
    });
  });

  it("T-CRM-120-8: renders all 4 sections when data present", async () => {
    vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue(sampleResponse);

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText("Ion Popescu"));

    // Section 1: overdue task
    expect(screen.getByText("Task-uri scadente")).toBeInTheDocument();
    expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    expect(screen.getByText("Suna clientul")).toBeInTheDocument();

    // Section 2: new uncontacted
    expect(screen.getByText("Leaduri noi necontactate")).toBeInTheDocument();
    expect(screen.getByText("Maria Ionescu")).toBeInTheDocument();

    // Section 3: follow-up
    expect(screen.getByText("Follow-up de făcut")).toBeInTheDocument();
    expect(screen.getByText("Ana Dumitrescu")).toBeInTheDocument();

    // Section 4: NBA
    expect(screen.getByText("Next Best Action (top 5)")).toBeInTheDocument();
    expect(screen.getByText("Petre Constantinescu")).toBeInTheDocument();
  });

  it("T-CRM-120-1: calls fetchTodayDashboard on mount", async () => {
    render(<TodayDashboardPage />);

    await waitFor(() => {
      expect(leadsApi.fetchTodayDashboard).toHaveBeenCalledTimes(1);
    });
  });

  it("T-CRM-120-10: clicking a row navigates to lead detail", async () => {
    vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue(sampleResponse);

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText("Ion Popescu"));

    // Click on the lead row
    const leadBtn = screen.getByRole("button", { name: /Task pentru Ion Popescu/i });
    fireEvent.click(leadBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/app/leads/l1");
  });

  it("T-CRM-120-10: clicking NBA row navigates to lead detail", async () => {
    vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue(sampleResponse);

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText("Petre Constantinescu"));

    const nbaBtn = screen.getByRole("button", { name: /NBA Lead Petre Constantinescu/i });
    fireEvent.click(nbaBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/app/leads/l4");
  });

  it("shows summary bar when totalActions > 0", async () => {
    vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue(sampleResponse);

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText(/Ai 3 acțiuni de făcut azi/i));

    expect(screen.getByText(/Ai 3 acțiuni de făcut azi/i)).toBeInTheDocument();
  });

  it("T-CRM-120-5: nextBestAction has max 5 items and shows score", async () => {
    const manyNBA = Array.from({ length: 5 }, (_, i) => ({
      id: `nba-${i}`,
      fullName: `Lead NBA ${i}`,
      stage: "new",
      phone: null,
      interestCourse: null,
      valueCents: 0,
      score: 80 - i * 10,
      ageDays: i,
    }));
    vi.mocked(leadsApi.fetchTodayDashboard).mockResolvedValue({
      ...emptyResponse,
      nextBestAction: manyNBA,
      totalActions: 0,
    });

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText("Lead NBA 0"));

    // Scores are shown in the badges
    expect(screen.getByText("80")).toBeInTheDocument();
    // Max 5
    expect(screen.queryByText("Lead NBA 5")).toBeNull();
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(leadsApi.fetchTodayDashboard).mockRejectedValue(new Error("Server error"));

    render(<TodayDashboardPage />);
    await waitFor(() => screen.getByText("Server error"));

    expect(screen.getByText("Server error")).toBeInTheDocument();
  });
});
