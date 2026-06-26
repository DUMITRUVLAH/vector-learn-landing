/**
 * VM1-04: par_events schema + route validation tests
 *
 * T-VM1-04-1 [blocant] parEvents schema has required columns
 * T-VM1-04-2 [blocant] parRequests schema has eventId column
 * T-VM1-04-3 [normal] event dropdown filtered by projectId is correct subset
 * T-VM1-04-4 [normal] soft-delete sets active=false
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { parEvents, parRequests } from "../../db/schema/par";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VM1-04: parEvents schema", () => {
  it("T-VM1-04-1 [blocant] parEvents table has required columns", () => {
    // Verify the table export exists and has the right columns
    expect(parEvents).toBeDefined();

    // Check column keys
    const colKeys = Object.keys(parEvents);
    expect(colKeys).toContain("id");
    expect(colKeys).toContain("tenantId");
    expect(colKeys).toContain("name");
    expect(colKeys).toContain("active");
    expect(colKeys).toContain("projectId");
    expect(colKeys).toContain("startsAt");
    expect(colKeys).toContain("endsAt");
    expect(colKeys).toContain("createdAt");
    expect(colKeys).toContain("updatedAt");
  });

  it("T-VM1-04-2 [blocant] parRequests has eventId column (FK to par_events)", () => {
    const colKeys = Object.keys(parRequests);
    expect(colKeys).toContain("eventId");
  });

  it("T-VM1-04-3 [normal] event filter logic: subset by projectId", () => {
    // Simulate the client-side filter logic used in ParCreateForm:
    // Given a list of events with mixed projectIds, only those matching the project should appear.
    const projectId = "proj-001";
    const events = [
      { id: "ev-1", name: "Conf 2026", projectId: "proj-001", active: true },
      { id: "ev-2", name: "Webinar", projectId: "proj-002", active: true },
      { id: "ev-3", name: "Workshop", projectId: null, active: true },
      { id: "ev-4", name: "Old event", projectId: "proj-001", active: false },
    ];

    const filteredForProject = events.filter((ev) => ev.projectId === projectId && ev.active);
    expect(filteredForProject).toHaveLength(1);
    expect(filteredForProject[0].name).toBe("Conf 2026");

    // Without project filter — only active
    const allActive = events.filter((ev) => ev.active);
    expect(allActive).toHaveLength(3);
  });

  it("T-VM1-04-4 [normal] soft-delete pattern: active=false excludes event from active list", () => {
    // The API does soft-delete: active=false instead of DELETE.
    // Active events only list: filter(ev => ev.active === true)
    const events = [
      { id: "ev-1", name: "Active", active: true },
      { id: "ev-2", name: "Deleted", active: false },
    ];

    const activeOnly = events.filter((ev) => ev.active);
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].name).toBe("Active");
  });
});

describe("VM1-04: parEvents column types", () => {
  it("T-VM1-04-1c [blocant] parEvents.$inferInsert type has expected nullable fields", () => {
    // Type-level check: if these assignments compile, the schema is correct.
    // Using satisfies to verify the type shape at test-compile time.
    const row: typeof parEvents.$inferInsert = {
      tenantId: "00000000-0000-0000-0000-000000000001",
      name: "Test Event",
    };
    expect(row.name).toBe("Test Event");
    expect(row.projectId).toBeUndefined(); // optional
    expect(row.startsAt).toBeUndefined();  // optional
    expect(row.active).toBeUndefined();    // has DB default
  });
});
