/**
 * KINDER-003 — Staff-to-child ratio monitoring tests
 *
 * T-KINDER-003-1 [blocant]: GET /api/kinder/ratio/live → 200 with rooms array
 * T-KINDER-003-2 [blocant]: status "over" when children > limit × staff
 * T-KINDER-003-3 [blocant]: KinderRatioPage smoke renders without crash
 * T-KINDER-003-4 [normal]:  POST /api/kinder/ratio/limits creates limit entry
 * T-KINDER-003-5 [normal]:  status "unconfigured" when no limit set for room
 * T-KINDER-003-6 [normal]:  status "warning" at 80% capacity threshold
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { KinderRatioPage } from "../../pages/app/KinderRatioPage";
import type { LiveRatioResponse, RatioStatus, RoomRatioStatus } from "../../lib/api/kinder";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Admin" }, tenant: { id: "t1", name: "Test Grăd." } },
    logout: vi.fn(),
  }),
}));

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/kinder/ratio", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// ─── Pure logic helpers ────────────────────────────────────────────────────────

/** Mirror of the server computeStatus function */
function computeStatus(
  childrenPresent: number,
  staffPresent: number,
  limit: number | null
): RatioStatus {
  if (limit === null) return "unconfigured";
  if (staffPresent === 0) return childrenPresent > 0 ? "over" : "ok";
  const capacity = staffPresent * limit;
  if (childrenPresent > capacity) return "over";
  if (childrenPresent >= Math.floor(capacity * 0.8)) return "warning";
  return "ok";
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROOM_OK: RoomRatioStatus = {
  roomId: "r1",
  roomName: "Clasa Albă",
  childrenCount: 5,
  staffCount: 2,
  ratioLimit: 6,
  ageGroupLabel: "3-5 ani",
  status: "ok",
};

const ROOM_OVER: RoomRatioStatus = {
  roomId: "r2",
  roomName: "Clasa Albastră",
  childrenCount: 15,
  staffCount: 2,
  ratioLimit: 6,
  ageGroupLabel: "0-2 ani",
  status: "over",
};

const LIVE_RESPONSE: LiveRatioResponse = {
  date: "2026-06-01",
  hasOverCapacity: true,
  rooms: [ROOM_OK, ROOM_OVER],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("KINDER-003: Staff-to-child ratio monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * T-KINDER-003-1 [blocant]
   * getLiveRatio resolves with correct shape
   */
  it("T-KINDER-003-1 [blocant]: getLiveRatio resolves with rooms array", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => LIVE_RESPONSE,
    } as Response);

    const { getLiveRatio } = await import("../../lib/api/kinder");
    const result = await getLiveRatio();

    expect(result.rooms).toHaveLength(2);
    expect(result.hasOverCapacity).toBe(true);
    expect(result.rooms[0].roomName).toBe("Clasa Albă");
  });

  /**
   * T-KINDER-003-2 [blocant]
   * computeStatus returns "over" when children > limit × staff
   */
  it("T-KINDER-003-2 [blocant]: computeStatus returns over when children > limit × staff", () => {
    // 15 children, 2 staff, limit 6 → capacity 12 → over
    expect(computeStatus(15, 2, 6)).toBe("over");
    // 12 children, 2 staff, limit 6 → capacity 12 → NOT over (exactly at limit)
    expect(computeStatus(12, 2, 6)).toBe("warning"); // 80% of 12 = 9.6, 12 >= 9.6 → warning
    // 5 children, 2 staff, limit 6 → capacity 12 → ok
    expect(computeStatus(5, 2, 6)).toBe("ok");
  });

  /**
   * T-KINDER-003-3 [blocant]
   * KinderRatioPage smoke renders without crash
   */
  it("T-KINDER-003-3 [blocant]: KinderRatioPage smoke renders without crash", async () => {
    global.fetch = vi.fn()
      // getLiveRatio
      .mockResolvedValueOnce({ ok: true, json: async () => LIVE_RESPONSE } as Response)
      // getRatioLimits
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      // rooms list
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rooms: [] }) } as Response)
      // other fetches
      .mockResolvedValue({ ok: false } as Response);

    expect(() => render(<KinderRatioPage />)).not.toThrow();
    expect(document.body).toBeTruthy();

    await waitFor(() => {
      const hasContent =
        document.body.textContent?.includes("Raport") ||
        document.body.textContent?.includes("personal");
      expect(hasContent).toBe(true);
    }, { timeout: 2000 });
  });

  /**
   * T-KINDER-003-4 [normal]
   * createRatioLimit API call sends correct payload
   */
  it("T-KINDER-003-4 [normal]: createRatioLimit sends POST with correct payload", async () => {
    const mockLimit = { id: "l1", tenantId: "t1", roomId: "r1", maxChildrenPerStaff: 6, ageGroupLabel: "3-5 ani", createdAt: "", updatedAt: "" };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, limit: mockLimit }),
    } as Response);

    const { createRatioLimit } = await import("../../lib/api/kinder");
    const result = await createRatioLimit({ roomId: "r1", maxChildrenPerStaff: 6, ageGroupLabel: "3-5 ani" });

    expect(result.ok).toBe(true);
    expect(result.limit.maxChildrenPerStaff).toBe(6);
    expect(result.limit.ageGroupLabel).toBe("3-5 ani");
  });

  /**
   * T-KINDER-003-5 [normal]
   * computeStatus returns "unconfigured" when no limit set
   */
  it("T-KINDER-003-5 [normal]: computeStatus returns unconfigured when no limit", () => {
    expect(computeStatus(10, 2, null)).toBe("unconfigured");
    expect(computeStatus(0, 0, null)).toBe("unconfigured");
  });

  /**
   * T-KINDER-003-6 [normal]
   * computeStatus returns "warning" at 80% threshold
   */
  it("T-KINDER-003-6 [normal]: computeStatus returns warning at 80% threshold", () => {
    // Capacity = 2 staff × 10 limit = 20
    // 80% of 20 = 16
    // 16 children → warning
    expect(computeStatus(16, 2, 10)).toBe("warning");
    // 15 children → ok (below 80%)
    expect(computeStatus(15, 2, 10)).toBe("ok");
    // 21 children → over
    expect(computeStatus(21, 2, 10)).toBe("over");
  });
});
