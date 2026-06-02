/**
 * SCHOOL-006 — T-SCHOOL-006-7: SchoolTimetablePage render test
 *
 * Smoke test: pagina se randează fără crash cu date mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/api/timetable", () => ({
  listTimetableSlots: vi.fn().mockResolvedValue({ slots: [] }),
  createTimetableSlot: vi.fn(),
  patchTimetableSlot: vi.fn(),
  deleteTimetableSlot: vi.fn(),
}));

vi.mock("@/lib/api/school", () => ({
  listAcademicYears: vi.fn().mockResolvedValue({
    years: [
      {
        id: "year-1",
        tenantId: "tenant-1",
        name: "2026–2027",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        isCurrent: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  listSchoolClasses: vi.fn().mockResolvedValue({
    classes: [
      {
        id: "class-1",
        tenantId: "tenant-1",
        academicYearId: "year-1",
        name: "a V-a A",
        gradeLevel: "5",
        section: "A",
        homeroomTeacherId: null,
        homeroomTeacherName: null,
        capacity: 25,
        enrollmentCount: 18,
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
  useRouter: vi.fn().mockReturnValue({ navigate: vi.fn(), path: "/app/school/timetable" }),
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

import { SchoolTimetablePage } from "../../pages/app/SchoolTimetablePage";

describe("SchoolTimetablePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-SCHOOL-006-7: se randează fără crash", () => {
    const { container } = render(<SchoolTimetablePage />);
    expect(container).toBeTruthy();
  });

  it("[normal] afișează titlul paginii", () => {
    render(<SchoolTimetablePage />);
    expect(screen.getByText("Orar master")).toBeTruthy();
  });

  it("[normal] afișează butonul de adăugare slot", () => {
    render(<SchoolTimetablePage />);
    expect(screen.getByRole("button", { name: /adaugă slot/i })).toBeTruthy();
  });
});
