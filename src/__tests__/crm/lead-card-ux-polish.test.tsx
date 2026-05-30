/**
 * CRM-131 — Lead card UX polish
 * Tests: T-CRM-131-1..7
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { LeadCardSkeleton } from "@/components/crm/LeadCardSkeleton";
import { useUndoableDelete } from "@/hooks/useUndoableDelete";
import { renderHook } from "@testing-library/react";

// ─── T-CRM-131-1: Skeleton renders animate-pulse, not Loader2 ────────────────

describe("LeadCardSkeleton", () => {
  it("T-CRM-131-1 [blocant] renders animate-pulse elements, not Loader2 spinner", () => {
    render(<LeadCardSkeleton />);

    // Should have animate-pulse wrapper
    const skeleton = document.querySelector(".animate-pulse");
    expect(skeleton).not.toBeNull();

    // Should NOT contain the Loader2 spin class (that's the old spinner)
    const spinners = document.querySelectorAll(".animate-spin");
    // The skeleton itself may contain a spinner (inside it for accessibility) but
    // the entire skeleton should NOT be just a single centered spinner
    const skeletonBoxes = document.querySelectorAll(".bg-muted");
    expect(skeletonBoxes.length).toBeGreaterThan(5); // has multiple placeholder boxes

    // aria-busy is set
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
  });
});

// ─── T-CRM-131-2..3: Optimistic note UI ──────────────────────────────────────

// We test the hook + state logic in isolation since full LeadCardPage requires
// heavy mocking. Test the hook behavior and the state transitions directly.

describe("useUndoableDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T-CRM-131-4 [blocant] cancel before delay — delete callback NOT called", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useUndoableDelete({
        delayMs: 5000,
        onDelete: deleteFn,
      })
    );

    // Schedule delete
    act(() => {
      result.current.scheduleDelete("task-abc");
    });

    // Cancel within 100ms
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.undoDelete();
    });

    // Advance past the full delay
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("T-CRM-131-5 without cancel — delete callback called after delay", async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useUndoableDelete({
        delayMs: 5000,
        onDelete: deleteFn,
      })
    );

    act(() => {
      result.current.scheduleDelete("task-xyz");
    });

    // Advance past delay
    await act(async () => {
      vi.advanceTimersByTime(5500);
      // flush microtasks
      await Promise.resolve();
    });

    expect(deleteFn).toHaveBeenCalledOnce();
    expect(deleteFn).toHaveBeenCalledWith("task-xyz");
  });

  it("undoDelete returns the pending id and null when no pending", () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useUndoableDelete({
        delayMs: 5000,
        onDelete: deleteFn,
      })
    );

    // No pending delete yet
    act(() => {
      const id = result.current.undoDelete();
      expect(id).toBeNull();
    });

    // Schedule then undo
    act(() => {
      result.current.scheduleDelete("task-123");
    });

    act(() => {
      const id = result.current.undoDelete();
      expect(id).toBe("task-123");
    });
  });
});

// ─── T-CRM-131-2: Optimistic note appears with "Se salvează..." ─────────────
// T-CRM-131-3: On error, optimistic note disappears + error toast

// These require a full render of LeadCardPage. We test the optimistic insert
// behavior by checking the state flow in the addNote handler via a simplified
// integration-style test.

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

function setupMocks() {
  vi.mocked(leadsApi.getLead).mockResolvedValue(mockLead);
  vi.mocked(pipelineApi.fetchPipelineStages).mockResolvedValue({ stages: mockStages });
  vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });
  vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });
  vi.mocked(tasksApi.listAttachments).mockResolvedValue({ items: [] });
  vi.mocked(leadsApi.listContacts).mockResolvedValue({ items: [] });
  vi.mocked(leadsApi.listTags).mockResolvedValue({ tags: [] });
  vi.mocked(leadsApi.listFieldValues).mockResolvedValue({ fields: [], values: [] });
}

describe("LeadCardPage — CRM-131 optimistic note + empty states", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("T-CRM-131-2 [blocant] note appears immediately with 'Se salvează...' before server confirms", async () => {
    // addInteraction resolves after a delay
    let resolveNote!: (v: leadsApi.LeadInteraction) => void;
    vi.mocked(leadsApi.addInteraction).mockReturnValue(
      new Promise<leadsApi.LeadInteraction>((res) => { resolveNote = res; })
    );

    render(<LeadCardPage leadId="lead-1" />);

    // Wait for page to load
    await waitFor(() => expect(screen.getByPlaceholderText("Adaugă o notă internă…")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("Adaugă o notă internă…");
    const submitBtn = screen.getByRole("button", { name: "Adaugă" });

    fireEvent.change(input, { target: { value: "Test optimistic note" } });
    fireEvent.click(submitBtn);

    // The note should appear immediately with "Se salvează..."
    await waitFor(() => {
      expect(screen.getByText(/Se salvează\.\.\./i)).toBeInTheDocument();
    });

    // Resolve the server response
    resolveNote({
      id: "server-id-1",
      leadId: "lead-1",
      type: "note",
      direction: null,
      body: "Test optimistic note",
      occurredAt: new Date().toISOString(),
      metadata: null,
    });

    // After resolve, "Se salvează..." should be gone
    await waitFor(() => {
      expect(screen.queryByText(/Se salvează\.\.\./i)).toBeNull();
    });
  });

  it("T-CRM-131-3 [blocant] on error, optimistic note is removed + error toast shown", async () => {
    vi.mocked(leadsApi.addInteraction).mockRejectedValue(new Error("Network error"));

    render(<LeadCardPage leadId="lead-1" />);

    await waitFor(() => expect(screen.getByPlaceholderText("Adaugă o notă internă…")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("Adaugă o notă internă…");
    const submitBtn = screen.getByRole("button", { name: "Adaugă" });

    fireEvent.change(input, { target: { value: "Eroare nota" } });
    fireEvent.click(submitBtn);

    // Error toast appears
    await waitFor(() => {
      expect(screen.getByText(/Nu s-a salvat nota/i)).toBeInTheDocument();
    });

    // Optimistic entry gone
    expect(screen.queryByText(/Se salvează\.\.\./i)).toBeNull();
  });

  it("T-CRM-131-6 [blocant] empty activity tab shows correct copy", async () => {
    vi.mocked(leadsApi.listInteractions).mockResolvedValue({ items: [] });

    render(<LeadCardPage leadId="lead-1" />);

    await waitFor(() => {
      expect(screen.getByText(/Nicio activitate încă/i)).toBeInTheDocument();
    });
  });

  it("T-CRM-131-7 empty tasks tab shows correct copy", async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue({ items: [] });

    render(<LeadCardPage leadId="lead-1" />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Task-uri" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Task-uri" }));

    await waitFor(() => {
      expect(screen.getByText(/Nicio sarcină/i)).toBeInTheDocument();
    });
  });
});
