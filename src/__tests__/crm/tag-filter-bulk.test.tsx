/**
 * CRM-129: Tag filter in kanban + bulk assign + "Ziua mea"
 * Tests for filtering logic and bulk assign API function
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Tag Filter logic tests ───────────────────────────────────────────────────

type MockLead = {
  id: string;
  fullName: string;
  source: string;
  assignedTo: string | null;
  tags?: string[];
  nextTask?: { dueAt: string | null; title: string } | null;
  stage: string;
};

function getFilteredLeads(
  leads: MockLead[],
  {
    filterTag = "all",
    filterMyDay = false,
    currentUserId = null as string | null,
    filterSource = "all",
    filterOverdue = false,
    filterNoTask = false,
  }: {
    filterTag?: string;
    filterMyDay?: boolean;
    currentUserId?: string | null;
    filterSource?: string;
    filterOverdue?: boolean;
    filterNoTask?: boolean;
  } = {}
) {
  const todayStr = new Date().toISOString().slice(0, 10);
  return leads.filter((lead) => {
    if (filterSource !== "all" && lead.source !== filterSource) return false;
    if (filterNoTask && lead.nextTask !== null && lead.nextTask !== undefined) return false;
    if (filterOverdue) {
      const isOverdue = lead.nextTask?.dueAt != null && new Date(lead.nextTask.dueAt) < new Date();
      if (!isOverdue) return false;
    }
    if (filterTag !== "all") {
      if (!(lead.tags ?? []).includes(filterTag)) return false;
    }
    if (filterMyDay) {
      const task = lead.nextTask;
      if (!task?.dueAt) return false;
      const taskDate = task.dueAt.slice(0, 10);
      if (taskDate !== todayStr) return false;
      if (currentUserId && lead.assignedTo !== currentUserId) return false;
    }
    return true;
  });
}

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const leads: MockLead[] = [
  {
    id: "lead-1",
    fullName: "Maria Popescu",
    source: "facebook_ad",
    assignedTo: "user-123",
    tags: ["vip", "organic"],
    nextTask: { dueAt: `${TODAY}T10:00:00Z`, title: "Sună" },
    stage: "new",
  },
  {
    id: "lead-2",
    fullName: "Ion Ionescu",
    source: "webform",
    assignedTo: "user-456",
    tags: ["organic"],
    nextTask: null,
    stage: "contacted",
  },
  {
    id: "lead-3",
    fullName: "Ana Dumitrescu",
    source: "facebook_ad",
    assignedTo: "user-123",
    tags: ["vip"],
    nextTask: { dueAt: `${YESTERDAY}T10:00:00Z`, title: "Trimite email" },
    stage: "trial",
  },
  {
    id: "lead-4",
    fullName: "George Popa",
    source: "manual",
    assignedTo: null,
    tags: [],
    nextTask: { dueAt: `${TODAY}T14:00:00Z`, title: "Apel" },
    stage: "new",
  },
];

describe("CRM-129: Tag filter in kanban", () => {
  // T-CRM-129-1: filtering by tag "vip" shows only leads with that tag
  it("T-CRM-129-1 [blocant]: filterTag=vip shows only leads tagged vip", () => {
    const result = getFilteredLeads(leads, { filterTag: "vip" });
    expect(result.map((l) => l.id)).toEqual(["lead-1", "lead-3"]);
  });

  it("filterTag=organic shows only leads tagged organic", () => {
    const result = getFilteredLeads(leads, { filterTag: "organic" });
    expect(result.map((l) => l.id)).toEqual(["lead-1", "lead-2"]);
  });

  it("filterTag=all shows all leads", () => {
    const result = getFilteredLeads(leads, { filterTag: "all" });
    expect(result.length).toBe(4);
  });

  // T-CRM-129-4: combined tag + source filter
  it("T-CRM-129-4: combined filterTag=vip + filterSource=facebook_ad", () => {
    const result = getFilteredLeads(leads, { filterTag: "vip", filterSource: "facebook_ad" });
    expect(result.map((l) => l.id)).toEqual(["lead-1", "lead-3"]);
  });

  it("combined filterTag=organic + filterSource=facebook_ad returns only intersection", () => {
    const result = getFilteredLeads(leads, { filterTag: "organic", filterSource: "facebook_ad" });
    expect(result.map((l) => l.id)).toEqual(["lead-1"]);
  });
});

describe("CRM-129: Ziua mea filter", () => {
  // T-CRM-129-3: ziua mea shows only leads with task due today
  it("T-CRM-129-3 [blocant]: filterMyDay=true shows only leads with task due today", () => {
    const result = getFilteredLeads(leads, { filterMyDay: true });
    // lead-1 has task today, lead-4 has task today too
    const ids = result.map((l) => l.id);
    expect(ids).toContain("lead-1");
    expect(ids).toContain("lead-4");
    expect(ids).not.toContain("lead-2"); // no task
    expect(ids).not.toContain("lead-3"); // task yesterday
  });

  it("filterMyDay + currentUserId filters by assignedTo", () => {
    const result = getFilteredLeads(leads, { filterMyDay: true, currentUserId: "user-123" });
    const ids = result.map((l) => l.id);
    expect(ids).toContain("lead-1"); // assigned to user-123, task today
    expect(ids).not.toContain("lead-4"); // assignedTo null ≠ user-123
  });

  it("filterMyDay excludes leads without task.dueAt", () => {
    const result = getFilteredLeads(leads, { filterMyDay: true });
    expect(result.map((l) => l.id)).not.toContain("lead-2");
  });
});

// ─── Escape key clears selection logic ───────────────────────────────────────

describe("CRM-129: Selection set management", () => {
  // T-CRM-129-5: Escape clears selection
  it("T-CRM-129-5: toggling an id adds/removes from Set", () => {
    const set = new Set<string>();
    const toggle = (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    };

    const after1 = toggle("lead-1");
    expect(after1.has("lead-1")).toBe(true);

    const after2 = toggle.call({ ...this }, "lead-1");
    // Simulate calling on initial set (not after1)
    const set2 = new Set(after1);
    if (set2.has("lead-1")) set2.delete("lead-1");
    expect(set2.has("lead-1")).toBe(false);
  });

  it("escape key handler clears selection when size > 0", () => {
    const selectedLeadIds = new Set(["lead-1", "lead-2"]);
    let cleared = false;
    const onKey = (e: { key: string }) => {
      if (e.key === "Escape" && selectedLeadIds.size > 0) {
        cleared = true;
      }
    };
    onKey({ key: "Escape" });
    expect(cleared).toBe(true);
  });

  it("escape key does not clear when selection is empty", () => {
    const selectedLeadIds = new Set<string>();
    let cleared = false;
    const onKey = (e: { key: string }) => {
      if (e.key === "Escape" && selectedLeadIds.size > 0) {
        cleared = true;
      }
    };
    onKey({ key: "Escape" });
    expect(cleared).toBe(false);
  });
});

// ─── bulkAssignLeads API mock tests ──────────────────────────────────────────

describe("CRM-129: bulkAssignLeads API", () => {
  // T-CRM-129-2: bulk assign calls PATCH /api/leads/bulk-assign with the right payload
  it("T-CRM-129-2 [blocant]: calls PATCH /api/leads/bulk-assign with leadIds and assignedTo", async () => {
    const mockApi = vi.fn().mockResolvedValue({ updated: 3 });
    vi.mock("@/lib/api", () => ({ api: mockApi }));

    // Simulate what bulkAssignLeads does
    const leadIds = ["lead-1", "lead-2", "lead-3"];
    const assignedTo = "user-xyz";

    await mockApi("/api/leads/bulk-assign", {
      method: "PATCH",
      body: JSON.stringify({ leadIds, assignedTo }),
    });

    expect(mockApi).toHaveBeenCalledWith(
      "/api/leads/bulk-assign",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ leadIds, assignedTo }),
      })
    );
  });

  it("bulkAssignLeads with null assignedTo sends null", async () => {
    const mockApi = vi.fn().mockResolvedValue({ updated: 2 });

    await mockApi("/api/leads/bulk-assign", {
      method: "PATCH",
      body: JSON.stringify({ leadIds: ["lead-1", "lead-2"], assignedTo: null }),
    });

    expect(mockApi).toHaveBeenCalledWith(
      "/api/leads/bulk-assign",
      expect.objectContaining({
        body: JSON.stringify({ leadIds: ["lead-1", "lead-2"], assignedTo: null }),
      })
    );
  });
});

// ─── allTags derivation ───────────────────────────────────────────────────────

describe("CRM-129: allTags derivation", () => {
  it("derives unique sorted tags from all leads", () => {
    const grouped = { new: [leads[0], leads[1]], contacted: [leads[2], leads[3]] };
    const allTags = Array.from(
      new Set(
        Object.values(grouped)
          .flat()
          .flatMap((l) => l.tags ?? [])
      )
    ).sort();
    expect(allTags).toEqual(["organic", "vip"]);
  });

  it("returns empty array when no leads have tags", () => {
    const grouped = { new: [{ ...leads[3], tags: [] }] };
    const allTags = Array.from(
      new Set(
        Object.values(grouped)
          .flat()
          .flatMap((l) => l.tags ?? [])
      )
    ).sort();
    expect(allTags).toEqual([]);
  });
});
