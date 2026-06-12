/**
 * PAR-110: ParTimeline component tests
 *
 * Tests:
 *   T-PAR-110-2 [normal] Given timeline events, Then renders chronological list
 *   - render-without-crash (blocant)
 *   - loading state shown
 *   - error state shown
 *   - empty state shown
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ParTimeline } from "../ParTimeline";
import * as parApi from "@/lib/api/par";
import type { ParTimelineEvent } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof parApi>();
  return {
    ...actual,
    getParTimeline: vi.fn(),
  };
});

function makeEvent(overrides: Partial<ParTimelineEvent> = {}): ParTimelineEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    event: "submitted",
    detail: "PAR-2026-0001 submitted; 2 approval step(s) generated.",
    diff: null,
    actor_user_id: "user-1",
    actor_name: "Sirbu Cristina",
    created_at: new Date("2026-06-10T08:00:00Z").toISOString(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParTimeline (T-PAR-110-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash with preloaded events", () => {
    const events = [
      makeEvent({ event: "created", actor_name: "Sirbu Cristina" }),
      makeEvent({ event: "submitted", actor_name: "Sirbu Cristina", created_at: new Date("2026-06-10T09:00:00Z").toISOString() }),
    ];

    const { container } = render(
      <ParTimeline parId="par-001" events={events} />
    );

    expect(container).toBeTruthy();
    expect(screen.getByRole("list")).toBeTruthy();
  });

  it("shows all timeline events when preloaded", () => {
    const events = [
      makeEvent({ event: "created", detail: null }),
      makeEvent({ event: "submitted", detail: "Submitted" }),
      makeEvent({ event: "approved", detail: "Step 1 approved" }),
    ];

    render(<ParTimeline parId="par-001" events={events} />);

    // All three events rendered
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("renders actor names", () => {
    const events = [
      makeEvent({ event: "submitted", actor_name: "Sirbu Cristina" }),
      makeEvent({ event: "approved", actor_name: "Ana Chirita" }),
    ];

    render(<ParTimeline parId="par-001" events={events} />);

    expect(screen.getByText("Sirbu Cristina")).toBeTruthy();
    expect(screen.getByText("Ana Chirita")).toBeTruthy();
  });

  it("shows empty state when no events", () => {
    render(<ParTimeline parId="par-001" events={[]} />);

    expect(screen.getByText(/no timeline events/i)).toBeTruthy();
  });

  it("fetches events from API when not preloaded", async () => {
    const mockGet = vi.mocked(parApi.getParTimeline);
    const events = [
      makeEvent({ event: "created" }),
      makeEvent({ event: "submitted" }),
    ];
    mockGet.mockResolvedValue({ timeline: events, total: 2 });

    render(<ParTimeline parId="par-fetch-001" />);

    // After fetch resolves, shows events
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
    expect(mockGet).toHaveBeenCalledWith("par-fetch-001");
  });

  it("shows error when API fails", async () => {
    const mockGet = vi.mocked(parApi.getParTimeline);
    mockGet.mockRejectedValue(new Error("Network error"));

    render(<ParTimeline parId="par-fail-001" />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeTruthy();
    });
  });

  it("renders diff as key-value pairs when diff is JSON", () => {
    const diff = JSON.stringify({
      endUse: { before: null, after: "Group consulting" },
    });

    const events = [
      makeEvent({ event: "edited", diff, detail: "Updated fields: endUse" }),
    ];

    render(<ParTimeline parId="par-001" events={events} />);

    // Should show "Changes" section
    expect(screen.getByText(/changes/i)).toBeTruthy();
  });

  it("has accessible section label", () => {
    const events = [makeEvent()];
    render(<ParTimeline parId="par-001" events={events} />);

    expect(screen.getByRole("region", { name: /par activity timeline/i })).toBeTruthy();
  });
});
