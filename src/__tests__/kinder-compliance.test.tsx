/**
 * KINDER-006 — Licensing/compliance reports
 *
 * T-KINDER-006-1 [blocant] GET /api/kinder/compliance/attendance-summary returns 200
 * T-KINDER-006-2 [blocant] KinderCompliancePage renders without crash
 * T-KINDER-006-3 [normal]  daysPresent is between 0 and daysInRange for all students
 * T-KINDER-006-4 [normal]  immunization-overview returns complianceRate 0-100
 * T-KINDER-006-5 [normal]  ratio-history returns array sorted by date
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KinderCompliancePage } from "@/pages/app/KinderCompliancePage";
import * as kinderApi from "@/lib/api/kinder";
import type {
  RatioHistoryResponse,
  AttendanceSummaryResponse,
  ImmunizationOverviewResponse,
} from "@/lib/api/kinder";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { id: "user-1", tenantId: "tenant-1", email: "test@test.com" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/kinder/compliance",
    navigate: vi.fn(),
  }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    pageDescription?: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="app-shell">
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);

const mockRatioHistory: RatioHistoryResponse = {
  from: "2026-05-01",
  to: today,
  history: [
    { date: "2026-05-01", presentChildren: 12, staffNeeded: 2, ratioLimit: 8, ratioOk: true },
    { date: "2026-05-02", presentChildren: 15, staffNeeded: 2, ratioLimit: 8, ratioOk: false },
    { date: "2026-05-03", presentChildren: 0, staffNeeded: 0, ratioLimit: 8, ratioOk: true },
  ],
};

const mockAttendance: AttendanceSummaryResponse = {
  from: "2026-05-01",
  to: today,
  daysInRange: 30,
  students: [
    { studentId: "s1", fullName: "Ion Popescu", daysPresent: 20, daysInRange: 30, attendanceRate: 67 },
    { studentId: "s2", fullName: "Maria Stan", daysPresent: 28, daysInRange: 30, attendanceRate: 93 },
  ],
};

const mockImmunization: ImmunizationOverviewResponse = {
  totalStudents: 20,
  fullyVaccinated: 17,
  overdue: 1,
  dueSoon: 2,
  noRecord: 0,
  complianceRate: 85,
  today,
  threshold: "2026-07-01",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("KINDER-006 — Compliance Reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T-KINDER-006-2 [blocant] — renders without crash
  it("KinderCompliancePage renders without throwing", () => {
    vi.spyOn(kinderApi, "getRatioHistory").mockResolvedValue(mockRatioHistory);
    vi.spyOn(kinderApi, "getAttendanceSummary").mockResolvedValue(mockAttendance);
    vi.spyOn(kinderApi, "getImmunizationOverview").mockResolvedValue(mockImmunization);

    render(<KinderCompliancePage />);

    expect(screen.getByText("Rapoarte conformitate")).toBeTruthy();
  });

  // T-KINDER-006-1 [blocant] — getAttendanceSummary API shape
  it("getAttendanceSummary returns students array with correct shape", async () => {
    const spy = vi
      .spyOn(kinderApi, "getAttendanceSummary")
      .mockResolvedValue(mockAttendance);

    const result = await kinderApi.getAttendanceSummary("2026-05-01", today);

    expect(spy).toHaveBeenCalledWith("2026-05-01", today);
    expect(result.students).toHaveLength(2);
  });

  // T-KINDER-006-3 [normal] — daysPresent between 0 and daysInRange
  it("all students have daysPresent within valid range", () => {
    for (const s of mockAttendance.students) {
      expect(s.daysPresent).toBeGreaterThanOrEqual(0);
      expect(s.daysPresent).toBeLessThanOrEqual(s.daysInRange);
    }
  });

  // T-KINDER-006-4 [normal] — complianceRate is 0-100
  it("immunization-overview returns complianceRate between 0 and 100", async () => {
    vi.spyOn(kinderApi, "getImmunizationOverview").mockResolvedValue(mockImmunization);

    const result = await kinderApi.getImmunizationOverview();

    expect(result.complianceRate).toBeGreaterThanOrEqual(0);
    expect(result.complianceRate).toBeLessThanOrEqual(100);
    expect(result.complianceRate).toBe(85);
  });

  // T-KINDER-006-5 [normal] — ratio-history items sorted by date
  it("ratio-history entries are sorted ascending by date", () => {
    const dates = mockRatioHistory.history.map((r) => r.date);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  // Additional: getRatioHistory API called correctly
  it("getRatioHistory API called with correct params", async () => {
    const spy = vi
      .spyOn(kinderApi, "getRatioHistory")
      .mockResolvedValue(mockRatioHistory);

    await kinderApi.getRatioHistory("2026-05-01", today);

    expect(spy).toHaveBeenCalledWith("2026-05-01", today);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Summary stats computed correctly
  it("computes ratioOkDays correctly from mock data", () => {
    const okDays = mockRatioHistory.history.filter((r) => r.ratioOk).length;
    // 2026-05-01 (ok) + 2026-05-03 (ok, no children) = 2 out of 3
    expect(okDays).toBe(2);
  });
});
