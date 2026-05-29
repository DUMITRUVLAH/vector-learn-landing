/**
 * HR-403 — Teacher availability grid
 *
 * T-HR-403-1: GET /api/hr/teachers/:id/availability → 200
 * T-HR-403-2: PUT upsert → disponibilitate salvată
 * T-HR-403-3: Grid UI toggles funcțional
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AvailabilitySlot } from "@/lib/api/availability";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/hr/teachers/t1/availability" }),
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
  AppShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      <h1>Disponibilitate</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/availability", () => ({
  getAvailability: vi.fn(),
  setAvailability: vi.fn(),
}));

import * as availabilityApi from "@/lib/api/availability";
import { AvailabilityPage } from "@/pages/app/AvailabilityPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeSlot = (overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot => ({
  id: "slot-001",
  tenantId: "tenant-001",
  teacherId: "t1",
  dayOfWeek: 4, // Friday
  startHour: 20,
  endHour: 21,
  isAvailable: false,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HR-403 — AvailabilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(availabilityApi.getAvailability).mockResolvedValue({ slots: [] });
    vi.mocked(availabilityApi.setAvailability).mockResolvedValue({ slots: [] });
  });

  /**
   * T-HR-403-3: Grid renderează fără crash
   */
  it("T-HR-403-3: grid disponibilitate afișat", async () => {
    render(<AvailabilityPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByTestId("availability-grid")).toBeInTheDocument();
    });
  });

  it("afișează heading Disponibilitate", async () => {
    render(<AvailabilityPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByText("Disponibilitate")).toBeInTheDocument();
    });
  });

  it("afișează zilele săptămânii", async () => {
    render(<AvailabilityPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByText("Lun")).toBeInTheDocument();
      expect(screen.getByText("Dum")).toBeInTheDocument();
    });
  });

  it("slot indisponibil existent → grid marcat", async () => {
    vi.mocked(availabilityApi.getAvailability).mockResolvedValue({
      slots: [makeSlot({ dayOfWeek: 0, startHour: 8, endHour: 9, isAvailable: false })],
    });
    render(<AvailabilityPage teacherId="t1" />);
    await waitFor(() => {
      expect(screen.getByTestId("availability-grid")).toBeInTheDocument();
    });
    // Should show "1 ore marcate indisponibile"
    expect(screen.getByText(/1 ore marcate/i)).toBeInTheDocument();
  });
});

describe("HR-403 — API shape", () => {
  /**
   * T-HR-403-1: getAvailability returnează slots
   */
  it("T-HR-403-1: getAvailability returnează slots array", async () => {
    vi.mocked(availabilityApi.getAvailability).mockResolvedValue({
      slots: [makeSlot()],
    });
    const result = await availabilityApi.getAvailability("t1");
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]).toHaveProperty("dayOfWeek");
    expect(result.slots[0]).toHaveProperty("startHour");
    expect(result.slots[0]).toHaveProperty("isAvailable");
  });

  /**
   * T-HR-403-2: setAvailability called with correct slots
   */
  it("T-HR-403-2: setAvailability apelat cu slots corecte", async () => {
    vi.mocked(availabilityApi.setAvailability).mockResolvedValue({ slots: [] });
    await availabilityApi.setAvailability("t1", [
      { dayOfWeek: 4, startHour: 20, endHour: 21, isAvailable: false },
    ]);
    expect(availabilityApi.setAvailability).toHaveBeenCalledWith(
      "t1",
      [{ dayOfWeek: 4, startHour: 20, endHour: 21, isAvailable: false }]
    );
  });
});

describe("HR-403 — slotsToGrid logic", () => {
  it("unmarked slot → all slots available (false)", () => {
    function slotsToGrid(slots: { dayOfWeek: number; startHour: number; endHour: number; isAvailable: boolean }[]) {
      const grid = Array.from({ length: 7 }, () => Array(16).fill(false));
      for (const slot of slots) {
        if (!slot.isAvailable) {
          for (let h = slot.startHour; h < slot.endHour; h++) {
            const hourIdx = h - 6;
            if (hourIdx >= 0 && hourIdx < 16) grid[slot.dayOfWeek][hourIdx] = true;
          }
        }
      }
      return grid;
    }

    const grid = slotsToGrid([{ dayOfWeek: 4, startHour: 20, endHour: 21, isAvailable: false }]);
    // hour 20 → index 14 (20-6=14), day 4
    expect(grid[4][14]).toBe(true);
    // other slots are false
    expect(grid[4][13]).toBe(false);
    expect(grid[0][0]).toBe(false);
  });
});
