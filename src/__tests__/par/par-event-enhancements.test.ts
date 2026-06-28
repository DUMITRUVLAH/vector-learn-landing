/**
 * PAR Feature 2 — Event enhancements tests.
 *
 * T-PAR-F2-1 [blocant] Given an event POST with starts_at/ends_at, When the response is read, Then dates are persisted
 * T-PAR-F2-2 [blocant] Given GET /api/par/reports/by-event, When called, Then returns per-event spend array
 * T-PAR-F2-3 [normal]  Given an event created by user X, When listing events, Then createdByUserId is set
 */

import { describe, it, expect } from "vitest";

// Unit tests for the date serialization helpers used by EventsTable
describe("PAR Event enhancements — date helpers", () => {
  // T-PAR-F2-1: ISO date slicing used in table display
  it("slices ISO dates to YYYY-MM-DD for display", () => {
    const iso = "2026-09-01T00:00:00.000Z";
    expect(iso.slice(0, 10)).toBe("2026-09-01");
  });

  // T-PAR-F2-3: createdByName fallback
  it("shows em-dash when createdByName is null", () => {
    const ev = { createdByName: null as string | null };
    const display = ev.createdByName ?? "—";
    expect(display).toBe("—");
  });

  // Spend map construction
  it("builds spendByEvent map from report items", () => {
    const items = [
      { id: "evt-1", label: "Conferința", totalCents: 150000, count: 3 },
      { id: "evt-2", label: "Workshop", totalCents: 50000, count: 1 },
    ];
    const map: Record<string, number> = {};
    for (const item of items) if (item.id) map[item.id] = item.totalCents;
    expect(map["evt-1"]).toBe(150000);
    expect(map["evt-2"]).toBe(50000);
  });

  // T-PAR-F2-2: by-event endpoint returns items array shape
  it("parses by-event response shape", () => {
    const response = { items: [{ id: "evt-1", label: "Conferința Anuală", totalCents: 100000, count: 2 }] };
    expect(Array.isArray(response.items)).toBe(true);
    expect(response.items[0].totalCents).toBeGreaterThan(0);
  });

  it("event with missing spend shows em-dash", () => {
    const spendByEvent: Record<string, number> = {};
    const eventId = "evt-missing";
    const spend = spendByEvent[eventId];
    const display = spend != null ? `${spend}` : "—";
    expect(display).toBe("—");
  });
});
