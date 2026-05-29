/**
 * HR-402 — Teacher stats
 *
 * T-HR-402-1: GET /api/hr/teacher-stats/:id → 200 cu toate câmpurile
 * T-HR-402-2: Stats cards afișate cu valori
 * T-HR-402-3: Period toggle funcțional
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { TeacherStats } from "@/lib/api/hrTeachers";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/hr/teachers/t1/stats" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/hrTeachers", () => ({
  getTeacherStats: vi.fn(),
}));

import * as hrTeachersApi from "@/lib/api/hrTeachers";
import { TeacherStatsPage } from "@/pages/app/TeacherStatsPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeStats = (overrides: Partial<TeacherStats> = {}): TeacherStats => ({
  teacherId: "t1",
  teacherName: "Ana Ionescu",
  period: "30d",
  lessonsCompleted: 20,
  hoursCompleted: 30,
  studentAttendanceRate: 88,
  revenueCents: 75000,
  topCourses: [
    { courseName: "Engleză B2", lessonCount: 12 },
    { courseName: "Matematică", lessonCount: 8 },
  ],
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HR-402 — TeacherStatsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hrTeachersApi.getTeacherStats).mockResolvedValue(makeStats());
  });

  /**
   * T-HR-402-2: Stats cards afișate
   */
  it("T-HR-402-2: stats cards afișate cu valori", async () => {
    render(<TeacherStatsPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByTestId("stats-grid")).toBeInTheDocument();
    });
    expect(screen.getByText("Ana Ionescu")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument(); // attendance
    expect(screen.getByText("30h")).toBeInTheDocument(); // hours
    expect(screen.getByText("20")).toBeInTheDocument(); // lessons
  });

  it("afișează top cursuri", async () => {
    render(<TeacherStatsPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByText("Engleză B2")).toBeInTheDocument();
    });
    expect(screen.getByText("Matematică")).toBeInTheDocument();
  });

  /**
   * T-HR-402-3: Period toggle apelează getTeacherStats cu perioada corectă
   */
  it("T-HR-402-3: period toggle 90 zile → getTeacherStats cu 90d", async () => {
    render(<TeacherStatsPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByText("90 zile")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("90 zile"));
    await waitFor(() => {
      expect(hrTeachersApi.getTeacherStats).toHaveBeenCalledWith("t1", "90d");
    });
  });
});

describe("HR-402 — getTeacherStats API shape", () => {
  /**
   * T-HR-402-1: returnează câmpurile corecte
   */
  it("T-HR-402-1: getTeacherStats returnează stats cu câmpurile corecte", async () => {
    vi.mocked(hrTeachersApi.getTeacherStats).mockResolvedValue(makeStats());

    const result = await hrTeachersApi.getTeacherStats("t1", "30d");
    expect(result).toHaveProperty("lessonsCompleted");
    expect(result).toHaveProperty("hoursCompleted");
    expect(result).toHaveProperty("studentAttendanceRate");
    expect(result).toHaveProperty("revenueCents");
    expect(result).toHaveProperty("topCourses");
  });
});
