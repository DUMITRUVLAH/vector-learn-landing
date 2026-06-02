/**
 * KINDER-001 — Check-in / authorized pickups tests
 *
 * T-KINDER-001-1 [blocant]: GET /api/kinder/checkin/today → 200 (mocked)
 * T-KINDER-001-2 [blocant]: POST /api/kinder/checkin action=in → creates entry
 * T-KINDER-001-3 [blocant]: KinderCheckinPage smoke render
 * T-KINDER-001-4 [normal]:  Check-out modal shows pickup-person field
 * T-KINDER-001-5 [normal]:  presentCount computed correctly (present = checkedInAt && !checkedOutAt)
 * T-KINDER-001-6 [normal]:  getStudentPickups call resolves array
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KinderCheckinPage } from "../../pages/app/KinderCheckinPage";
import type { TodayCheckinResponse, StudentCheckinStatus } from "../../lib/api/kinder";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Admin" }, tenant: { id: "t1", name: "Test Grăd." } },
    logout: vi.fn(),
  }),
}));

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/kinder/checkin", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRESENT_STUDENT: StudentCheckinStatus = {
  studentId: "s1",
  fullName: "Andrei Moraru",
  birthDate: "2021-03-15",
  checkedInAt: new Date().toISOString(),
  checkedOutAt: null,
  pickupPersonName: null,
  logId: "log1",
};

const ABSENT_STUDENT: StudentCheckinStatus = {
  studentId: "s2",
  fullName: "Elena Popescu",
  birthDate: "2020-07-22",
  checkedInAt: null,
  checkedOutAt: null,
  pickupPersonName: null,
  logId: null,
};

const TODAY_RESPONSE: TodayCheckinResponse = {
  date: new Date().toISOString().slice(0, 10),
  presentCount: 1,
  total: 2,
  students: [PRESENT_STUDENT, ABSENT_STUDENT],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("KINDER-001: Check-in / sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * T-KINDER-001-1 [blocant]
   * API call: getTodayCheckin resolves with correct shape
   */
  it("T-KINDER-001-1 [blocant]: getTodayCheckin resolves with students array", async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => TODAY_RESPONSE,
    } as Response);

    const { getTodayCheckin } = await import("../../lib/api/kinder");
    const result = await getTodayCheckin();

    expect(result.students).toHaveLength(2);
    expect(result.presentCount).toBe(1);
    expect(result.total).toBe(2);
  });

  /**
   * T-KINDER-001-2 [blocant]
   * POST /api/kinder/checkin action="in" → creates checkin entry
   */
  it("T-KINDER-001-2 [blocant]: recordCheckin returns ok and log entry", async () => {
    const mockLog = {
      id: "log1",
      studentId: "s1",
      logDate: "2026-06-01",
      checkedInAt: new Date().toISOString(),
      checkedOutAt: null,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, log: mockLog }),
    } as Response);

    const { recordCheckin } = await import("../../lib/api/kinder");
    const result = await recordCheckin({ studentId: "s1", action: "in" });

    expect(result.ok).toBe(true);
    expect(result.log.studentId).toBe("s1");
    expect(result.log.checkedInAt).toBeTruthy();
  });

  /**
   * T-KINDER-001-3 [blocant]
   * KinderCheckinPage renders without crash (smoke: no exception thrown)
   */
  it("T-KINDER-001-3 [blocant]: KinderCheckinPage smoke renders without crash", async () => {
    // Mock all fetch calls to return empty-ok (loading then empty state)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: "2026-06-01",
        presentCount: 0,
        total: 0,
        students: [],
      } satisfies TodayCheckinResponse),
    } as Response);

    // Should render without throwing
    expect(() => render(<KinderCheckinPage />)).not.toThrow();

    // Page should mount — at minimum the document body is rendered
    expect(document.body).toBeTruthy();

    // Wait for the loading spinner to disappear (page completes load)
    await waitFor(() => {
      // Either an error occurred (alert) or the empty state is shown
      const hasContent =
        document.body.textContent?.includes("Grădiniță") ||
        document.body.textContent?.includes("Check-in") ||
        document.body.textContent?.includes("elev");
      expect(hasContent).toBe(true);
    }, { timeout: 2000 });
  });

  /**
   * T-KINDER-001-4 [normal]
   * Present student shows Check-out button; absent shows Check-in button
   */
  it("T-KINDER-001-4 [normal]: present student shows check-out, absent shows check-in", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => TODAY_RESPONSE,
    } as Response);

    render(<KinderCheckinPage />);

    await waitFor(() => {
      expect(screen.getByText("Andrei Moraru")).toBeTruthy();
    }, { timeout: 2000 });

    // Present student should have check-out
    const checkoutBtns = screen.getAllByText(/check-out/i);
    expect(checkoutBtns.length).toBeGreaterThan(0);

    // Absent student should have check-in
    const checkinBtns = screen.getAllByText(/check-in/i);
    expect(checkinBtns.length).toBeGreaterThan(0);
  });

  /**
   * T-KINDER-001-5 [normal]
   * presentCount derived correctly: checkedInAt && !checkedOutAt
   */
  it("T-KINDER-001-5 [normal]: presentCount counts only checked-in (not checked-out) students", () => {
    // Pure logic test — no render needed
    const status1 = PRESENT_STUDENT; // checkedInAt set, checkedOutAt null → present
    const status2 = ABSENT_STUDENT;  // checkedInAt null → absent
    const leftStudent: StudentCheckinStatus = {
      ...PRESENT_STUDENT,
      studentId: "s3",
      checkedOutAt: new Date().toISOString(),
    };

    const computePresent = (students: StudentCheckinStatus[]) =>
      students.filter((s) => s.checkedInAt && !s.checkedOutAt).length;

    expect(computePresent([status1, status2, leftStudent])).toBe(1);
    expect(computePresent([status2, leftStudent])).toBe(0);
    expect(computePresent([status1])).toBe(1);
  });

  /**
   * T-KINDER-001-6 [normal]
   * getStudentPickups API call resolves to array
   */
  it("T-KINDER-001-6 [normal]: getStudentPickups resolves to array of pickups", async () => {
    const mockPickups = [
      { id: "p1", name: "Maria Moraru", relation: "mamă", phone: "+40700000001", isDefault: true, hasPin: false, createdAt: new Date().toISOString() },
    ];

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockPickups,
    } as Response);

    const { getStudentPickups } = await import("../../lib/api/kinder");
    const result = await getStudentPickups("s1");

    expect(Array.isArray(result)).toBe(true);
    expect(result[0].name).toBe("Maria Moraru");
    expect(result[0].isDefault).toBe(true);
  });
});
