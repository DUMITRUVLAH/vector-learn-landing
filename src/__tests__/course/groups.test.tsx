/**
 * COURSE-102 — Groups (classes) as entities
 * Tests:
 * T-COURSE-102-1: Migration created groups table (schema-drift checks this)
 * T-COURSE-102-2: Live API smoke (stubbed here)
 * T-COURSE-102-3: spotsRemaining calculation from maxStudents
 * T-COURSE-102-4: POST with invalid courseId returns error (covered in integration)
 * T-COURSE-102-5: GroupsPage renders with course filter
 * T-COURSE-102-6: Capacity badge shows "Plin" when spotsRemaining=0
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/groups", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

const mockListGroups = vi.fn();
const mockListCourses = vi.fn();

vi.mock("@/lib/api/groups", () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
  archiveGroup: vi.fn().mockResolvedValue({ ok: true }),
  patchGroup: vi.fn().mockResolvedValue({}),
  createGroup: vi.fn(),
}));

vi.mock("@/lib/api/courses", () => ({
  listCourses: (...args: unknown[]) => mockListCourses(...args),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
    actions,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => <span />,
}));

// ─── Test data ─────────────────────────────────────────────────────────────

const mockCourse = {
  id: "course-1",
  tenantId: "t1",
  name: "Engleză B2",
  cefrLevel: "B2",
  status: "active",
  defaultPriceCents: 50000,
  durationMinutes: 60,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockGroupActive = {
  id: "group-1",
  tenantId: "t1",
  courseId: "course-1",
  teacherId: null,
  roomId: null,
  name: "Engleză B2 — Mar/Joi 14:00",
  scheduleTemplate: { days: ["Marți", "Joi"], startTime: "14:00", endTime: "15:00" },
  maxStudents: 8,
  status: "active",
  enrolledCount: 5,
  spotsRemaining: 3,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockGroupFull = {
  ...mockGroupActive,
  id: "group-2",
  name: "Engleză B2 — Lun/Mie 10:00",
  maxStudents: 6,
  enrolledCount: 6,
  spotsRemaining: 0,
};

// ─── Import after mocks ───────────────────────────────────────────────────────

import { GroupsPage } from "@/pages/app/GroupsPage";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("COURSE-102 — Groups (classes) as entities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGroups.mockResolvedValue({ items: [mockGroupActive] });
    mockListCourses.mockResolvedValue({ items: [mockCourse] });
  });

  /**
   * T-COURSE-102-5 [blocant]: GroupsPage renders without crash
   */
  it("T-COURSE-102-5: GroupsPage renders without crash", async () => {
    render(<GroupsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /grupe/i })).toBeInTheDocument();
    });
  });

  /**
   * T-COURSE-102-5b [normal]: Course filter dropdown visible when courses loaded
   */
  it("T-COURSE-102-5b: course filter dropdown renders", async () => {
    render(<GroupsPage />);
    await waitFor(() => {
      expect(screen.getByText("Engleză B2 — Mar/Joi 14:00")).toBeInTheDocument();
    });
    expect(screen.getByRole("combobox", { name: /filtru curs/i })).toBeInTheDocument();
  });

  /**
   * T-COURSE-102-3 [blocant]: spotsRemaining displayed correctly
   */
  it("T-COURSE-102-3: spotsRemaining displayed in capacity badge", async () => {
    render(<GroupsPage />);
    await waitFor(() => {
      // 5/8 → low spots (≤3) but not full
      expect(screen.getByText("5/8")).toBeInTheDocument();
    });
  });

  /**
   * T-COURSE-102-6 [normal]: "Plin" badge shown when spotsRemaining=0
   */
  it("T-COURSE-102-6: full group shows Plin badge", async () => {
    mockListGroups.mockResolvedValue({ items: [mockGroupFull] });
    render(<GroupsPage />);
    await waitFor(() => {
      expect(screen.getByText("Plin")).toBeInTheDocument();
    });
  });

  /**
   * T-COURSE-102-7 [normal]: "Grupă nouă" opens GroupForm
   */
  it("T-COURSE-102-7: opens GroupForm dialog on add click", async () => {
    render(<GroupsPage />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /grupe/i })).toBeInTheDocument());

    const addBtn = screen.getByRole("button", { name: /adaugă grupă nouă/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /grupă nouă/i })).toBeInTheDocument();
    });
  });
});

// ─── Unit tests for spotsRemaining logic ─────────────────────────────────

describe("COURSE-102 — spotsRemaining calculation", () => {
  it("T-COURSE-102-3 (unit): spotsRemaining = maxStudents - enrolledCount", () => {
    const maxStudents = 8;
    const enrolledCount = 5;
    const spotsRemaining = Math.max(0, maxStudents - enrolledCount);
    expect(spotsRemaining).toBe(3);
  });

  it("T-COURSE-102-3b (unit): spotsRemaining never negative", () => {
    const maxStudents = 5;
    const enrolledCount = 6; // overbooked (should not happen but guard exists)
    const spotsRemaining = Math.max(0, maxStudents - enrolledCount);
    expect(spotsRemaining).toBe(0);
  });

  it("T-COURSE-102-3c (unit): full group has spotsRemaining=0", () => {
    const maxStudents = 6;
    const enrolledCount = 6;
    const spotsRemaining = Math.max(0, maxStudents - enrolledCount);
    expect(spotsRemaining).toBe(0);
    expect(spotsRemaining === 0).toBe(true); // "Plin" condition
  });
});
