/**
 * SCHOOL-003 — T-SCHOOL-003-6: SchoolAttendancePage render test
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/api/attendance", () => ({
  getAttendance: vi.fn().mockResolvedValue({
    session: {
      id: "sess-1",
      classId: "class-1",
      date: "2026-09-15",
      teacherId: null,
      notes: null,
      tenantId: "t-1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    records: [],
    enrolled: [
      { studentId: "s-1", studentName: "Ion Popescu" },
      { studentId: "s-2", studentName: "Maria Ionescu" },
    ],
  }),
  saveAttendanceRecords: vi.fn().mockResolvedValue({ records: [] }),
  createSession: vi.fn(),
  getStudentAttendance: vi.fn(),
}));

vi.mock("@/lib/api/school", () => ({
  listAcademicYears: vi.fn().mockResolvedValue({
    years: [
      {
        id: "year-1",
        name: "2026–2027",
        isCurrent: true,
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        tenantId: "t-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  listSchoolClasses: vi.fn().mockResolvedValue({
    classes: [
      {
        id: "class-1",
        name: "a V-a A",
        gradeLevel: "5",
        section: "A",
        academicYearId: "year-1",
        tenantId: "t-1",
        homeroomTeacherId: null,
        homeroomTeacherName: null,
        capacity: 25,
        enrollmentCount: 2,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn().mockReturnValue({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Test User", role: "admin" },
      tenant: { id: "t1", name: "Demo School" },
    },
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn().mockReturnValue({
    navigate: vi.fn(),
    path: "/app/school/attendance",
  }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={`#${to}`}>{children}</a>
  ),
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
      {actions && <div data-testid="actions">{actions}</div>}
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

import { SchoolAttendancePage } from "../../pages/app/SchoolAttendancePage";

describe("SchoolAttendancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-SCHOOL-003-6: se randează fără crash", () => {
    const { container } = render(<SchoolAttendancePage />);
    expect(container).toBeTruthy();
  });

  it("[normal] afișează titlul paginii", () => {
    render(<SchoolAttendancePage />);
    expect(screen.getByText("Prezență")).toBeTruthy();
  });

  it("[normal] afișează selectorul de dată", () => {
    render(<SchoolAttendancePage />);
    const dateInput = document.getElementById("date-select");
    expect(dateInput).toBeTruthy();
  });

  it("[normal] afișează label-ul pentru selectorul de clasă", () => {
    render(<SchoolAttendancePage />);
    // Label-ul există chiar și în timp ce clasele se încarcă
    expect(screen.getByText("Clasa")).toBeTruthy();
  });
});
