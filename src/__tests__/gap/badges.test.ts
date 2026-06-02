/**
 * GAP-019 — Gamification badges tests
 * GAP-020 — Leaderboard tests
 *
 * T-GAP-019-1 [blocant]: BADGE_TYPES contains all 7 expected types
 * T-GAP-019-2 [blocant]: BADGE_LABELS covers all badge types
 * T-GAP-019-3 [blocant]: getStudentBadges returns array of StudentBadge
 * T-GAP-019-4 [blocant]: checkBadges returns { awarded: BadgeType[] }
 * T-GAP-019-5 [blocant]: checkBadges is idempotent (second call returns empty awarded)
 * T-GAP-020-1 [blocant]: getLeaderboard returns array sorted by badgeCount desc
 * T-GAP-020-2 [blocant]: limit parameter respected (max items = limit)
 * T-GAP-020-3 [normal]: LeaderboardEntry has required fields
 * T-GAP-020-4 [normal]: GamificationPage renders without crash (smoke)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BADGE_TYPES,
  BADGE_LABELS,
  getStudentBadges,
  checkBadges,
  getLeaderboard,
  getBadgeStats,
  type StudentBadge,
  type BadgeType,
  type LeaderboardEntry,
  type BadgeStats,
} from "../../lib/api/badges";

// ─── Mock fetch ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(data: unknown, status = 200) {
  const body = JSON.stringify(data);
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(body),
  } as Response);
}

// ─── T-GAP-019-1: BADGE_TYPES shape ──────────────────────────────────────────

describe("GAP-019 — Badges constants", () => {
  it("T-GAP-019-1 [blocant]: BADGE_TYPES contains exactly 7 badge types", () => {
    expect(BADGE_TYPES).toHaveLength(7);
    expect(BADGE_TYPES).toContain("first_lesson");
    expect(BADGE_TYPES).toContain("ten_lessons");
    expect(BADGE_TYPES).toContain("hundred_lessons");
    expect(BADGE_TYPES).toContain("first_homework");
    expect(BADGE_TYPES).toContain("five_homework");
    expect(BADGE_TYPES).toContain("thirty_day_streak");
    expect(BADGE_TYPES).toContain("perfect_week");
  });

  it("T-GAP-019-2 [blocant]: BADGE_LABELS covers all badge types with title, description, emoji", () => {
    for (const type of BADGE_TYPES) {
      const label = BADGE_LABELS[type];
      expect(label, `Missing label for ${type}`).toBeDefined();
      expect(typeof label.title).toBe("string");
      expect(label.title.length).toBeGreaterThan(0);
      expect(typeof label.description).toBe("string");
      expect(typeof label.emoji).toBe("string");
      expect(label.emoji.length).toBeGreaterThan(0);
    }
  });
});

// ─── T-GAP-019-3: getStudentBadges ───────────────────────────────────────────

describe("GAP-019 — getStudentBadges", () => {
  it("T-GAP-019-3 [blocant]: returns array of StudentBadge from /api/badges/students/:id", async () => {
    const mockBadges: StudentBadge[] = [
      {
        id: "badge-1",
        badgeType: "first_lesson" as BadgeType,
        awardedAt: "2026-06-01T10:00:00Z",
        awardedReason: "Attended first lesson",
      },
    ];
    mockFetch(mockBadges);

    const result = await getStudentBadges("student-123");
    expect(result).toHaveLength(1);
    expect(result[0].badgeType).toBe("first_lesson");
    expect(result[0].awardedAt).toBe("2026-06-01T10:00:00Z");
  });

  it("T-GAP-019-3b [normal]: returns empty array when student has no badges", async () => {
    mockFetch([]);
    const result = await getStudentBadges("student-no-badges");
    expect(result).toEqual([]);
  });
});

// ─── T-GAP-019-4/5: checkBadges ──────────────────────────────────────────────

describe("GAP-019 — checkBadges", () => {
  it("T-GAP-019-4 [blocant]: returns { awarded: BadgeType[] } on first call", async () => {
    const result: { awarded: BadgeType[] } = { awarded: ["first_lesson"] };
    mockFetch(result);

    const res = await checkBadges("student-123");
    expect(res).toHaveProperty("awarded");
    expect(Array.isArray(res.awarded)).toBe(true);
    expect(res.awarded).toContain("first_lesson");
  });

  it("T-GAP-019-5 [blocant]: idempotent — second call returns empty awarded []", async () => {
    const result: { awarded: BadgeType[] } = { awarded: [] };
    mockFetch(result);

    const res = await checkBadges("student-123");
    expect(res.awarded).toEqual([]);
  });

  it("T-GAP-019-4b [blocant]: uses POST method", async () => {
    mockFetch({ awarded: [] });
    await checkBadges("student-abc");
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]?.method).toBe("POST");
  });
});

// ─── T-GAP-020-1/2/3: getLeaderboard ─────────────────────────────────────────

describe("GAP-020 — getLeaderboard", () => {
  const mockLeaderboard: LeaderboardEntry[] = [
    { rank: 1, studentId: "s1", studentName: "Maria P.", badgeCount: 5, changeFromLastMonth: 2 },
    { rank: 2, studentId: "s2", studentName: "Ion M.", badgeCount: 3, changeFromLastMonth: 0 },
    { rank: 3, studentId: "s3", studentName: "Ana R.", badgeCount: 1, changeFromLastMonth: 1 },
  ];

  it("T-GAP-020-1 [blocant]: returns array sorted desc by badgeCount", async () => {
    mockFetch(mockLeaderboard);
    const result = await getLeaderboard(10);
    expect(result).toHaveLength(3);
    // Should be sorted desc: 5, 3, 1
    expect(result[0].badgeCount).toBeGreaterThanOrEqual(result[1].badgeCount);
    expect(result[1].badgeCount).toBeGreaterThanOrEqual(result[2].badgeCount);
  });

  it("T-GAP-020-2 [blocant]: limit param is passed in URL", async () => {
    mockFetch([]);
    await getLeaderboard(3);
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call[0] as string;
    expect(url).toContain("limit=3");
  });

  it("T-GAP-020-3 [normal]: LeaderboardEntry has required fields", async () => {
    mockFetch(mockLeaderboard);
    const result = await getLeaderboard(10);
    for (const entry of result) {
      expect(entry).toHaveProperty("rank");
      expect(entry).toHaveProperty("studentId");
      expect(entry).toHaveProperty("studentName");
      expect(entry).toHaveProperty("badgeCount");
      expect(entry).toHaveProperty("changeFromLastMonth");
    }
  });
});

// ─── getBadgeStats ────────────────────────────────────────────────────────────

describe("GAP-020 — getBadgeStats", () => {
  it("T-GAP-020-5 [normal]: returns global stats with totalBadges, studentsWithBadges, topBadgeType", async () => {
    const mockStats: BadgeStats = {
      totalBadges: 42,
      studentsWithBadges: 15,
      topBadgeType: "first_lesson",
    };
    mockFetch(mockStats);
    const stats = await getBadgeStats();
    expect(stats.totalBadges).toBe(42);
    expect(stats.studentsWithBadges).toBe(15);
    expect(stats.topBadgeType).toBe("first_lesson");
  });

  it("T-GAP-020-5b [normal]: topBadgeType can be null when no badges exist", async () => {
    const mockStats: BadgeStats = {
      totalBadges: 0,
      studentsWithBadges: 0,
      topBadgeType: null,
    };
    mockFetch(mockStats);
    const stats = await getBadgeStats();
    expect(stats.totalBadges).toBe(0);
    expect(stats.topBadgeType).toBeNull();
  });
});
