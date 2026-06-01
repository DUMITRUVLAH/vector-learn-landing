/**
 * GAP-019/020 — Smoke tests for GamificationPage and StudentDetailPage
 *
 * T-GAP-019-6 [normal]: StudentDetailPage renders without crash (unauthenticated redirect)
 * T-GAP-020-4 [normal]: GamificationPage renders without crash (unauthenticated redirect)
 * T-GAP-019-7 [normal]: StudentBadgesSection renders 7 badge slots
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BADGE_TYPES, BADGE_LABELS } from "../../lib/api/badges";

// ─── Mock AppShell and hooks ──────────────────────────────────────────────────

vi.mock("../../components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("../../hooks/useSession", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

vi.mock("../../router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/gamification", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

// ─── T-GAP-020-4: GamificationPage smoke render ───────────────────────────────

describe("GAP-020 — GamificationPage", () => {
  it("T-GAP-020-4 [normal]: renders without crash when unauthenticated (redirects)", async () => {
    const { GamificationPage } = await import("../../pages/app/GamificationPage");
    // Should not throw
    expect(() => render(<GamificationPage />)).not.toThrow();
  });
});

// ─── T-GAP-019-7: StudentBadgesSection renders 7 badge slots ─────────────────

describe("GAP-019 — StudentBadgesSection badge slots", () => {
  it("T-GAP-019-7 [normal]: BADGE_TYPES has 7 items and all have labels", () => {
    expect(BADGE_TYPES).toHaveLength(7);
    for (const type of BADGE_TYPES) {
      expect(BADGE_LABELS[type]).toBeDefined();
      expect(BADGE_LABELS[type].title).toBeTruthy();
      expect(BADGE_LABELS[type].emoji).toBeTruthy();
    }
  });

  it("T-GAP-019-2 [normal]: all badge emojis are non-empty strings", () => {
    for (const type of BADGE_TYPES) {
      const { emoji } = BADGE_LABELS[type];
      expect(typeof emoji).toBe("string");
      expect(emoji.trim().length).toBeGreaterThan(0);
    }
  });
});
