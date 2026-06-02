/**
 * MOB-105: XP Page tests
 * T-MOB-105-5 [normal] XpPage renders XP bar and streak count without crash.
 * T-MOB-105-4 [normal] updateStreak on day 7 awards streak_7 badge (logic unit test via xp utility).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { XpPage } from "@/pages/app/mobile/XpPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/m/xp" }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-stu-1", role: "student", name: "Maria Test" } },
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: vi.fn((url: string) => {
    if (url === "/api/m/xp") {
      return Promise.resolve({
        totalXP: 150,
        level: 2,
        currentStreak: 5,
        longestStreak: 12,
        badges: [
          { badgeType: "first_homework", earnedAt: "2026-06-01T10:00:00Z" },
          { badgeType: "xp_100", earnedAt: "2026-06-02T10:00:00Z" },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected: ${url}`));
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("XpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-MOB-105-5 renders XP bar, streak count, and badges without crash", async () => {
    render(<XpPage />);

    // Initially loading
    expect(screen.getByLabelText(/se încarcă/i)).toBeInTheDocument();

    await waitFor(() => {
      // Level displayed
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    // XP total displayed
    expect(screen.getByText(/150 XP/)).toBeInTheDocument();

    // Streak count displayed
    expect(screen.getByLabelText(/streak curent: 5 zile/i)).toBeInTheDocument();

    // Progress bar present
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    // Badges visible
    expect(screen.getByText("Prima Temă")).toBeInTheDocument();
    expect(screen.getByText("100 XP")).toBeInTheDocument();
  });

  it("shows 'Nicio insignă' empty state when no badges", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api).mockResolvedValueOnce({
      totalXP: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      badges: [],
    });

    render(<XpPage />);

    await waitFor(() => {
      expect(screen.getByText(/nicio insignă încă/i)).toBeInTheDocument();
    });
  });
});
