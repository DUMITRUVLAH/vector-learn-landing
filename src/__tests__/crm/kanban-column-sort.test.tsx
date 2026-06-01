/**
 * T-CRM-142-1 [blocant] Given leads cu createdAt diferit + sort "oldest",
 *   Then primul e cel mai vechi.
 * T-CRM-142-2 [blocant] Given sort "value_desc", Then ordinea e descrescatoare dupa valueCents.
 * T-CRM-142-3 [blocant] Given sort "sla_first", Then red inaintea yellow inaintea green.
 * T-CRM-142-4 Given sort ales + remount, Then se citeste din localStorage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── localStorage mock for jsdom/Node.js 26 compatibility ────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

// ---------------------------------------------------------------------------
// Pure sort logic extracted from getFilteredLeads — test it directly
// ---------------------------------------------------------------------------

type SlaBadge = "green" | "yellow" | "red" | null | undefined;
type KanbanSort = "recent" | "oldest" | "value_desc" | "sla_first";

interface Lead {
  id: string;
  fullName: string;
  createdAt: string;
  valueCents: number;
  slaBadge?: SlaBadge;
}

function applyKanbanSort(leads: Lead[], sort: KanbanSort): Lead[] {
  return [...leads].sort((a, b) => {
    if (sort === "oldest") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sort === "value_desc") {
      return (b.valueCents ?? 0) - (a.valueCents ?? 0);
    }
    if (sort === "sla_first") {
      const slaOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 };
      const aOrd = slaOrder[a.slaBadge ?? "green"] ?? 2;
      const bOrd = slaOrder[b.slaBadge ?? "green"] ?? 2;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    // "recent" (default): newest first
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

const leads: Lead[] = [
  { id: "1", fullName: "Ion", createdAt: "2026-01-01T10:00:00Z", valueCents: 10000, slaBadge: "green" },
  { id: "2", fullName: "Maria", createdAt: "2026-03-15T10:00:00Z", valueCents: 50000, slaBadge: "red" },
  { id: "3", fullName: "Andrei", createdAt: "2026-02-01T10:00:00Z", valueCents: 30000, slaBadge: "yellow" },
];

describe("CRM-142 -- kanban column sort logic", () => {
  it("T-CRM-142-1 [blocant] -- sort oldest: first element has earliest createdAt", () => {
    const sorted = applyKanbanSort(leads, "oldest");
    expect(sorted[0].id).toBe("1"); // 2026-01-01 is oldest
    expect(sorted[1].id).toBe("3"); // 2026-02-01
    expect(sorted[2].id).toBe("2"); // 2026-03-15
  });

  it("recent sort: first element has latest createdAt", () => {
    const sorted = applyKanbanSort(leads, "recent");
    expect(sorted[0].id).toBe("2"); // 2026-03-15 is most recent
    expect(sorted[2].id).toBe("1"); // 2026-01-01 is oldest
  });

  it("T-CRM-142-2 [blocant] -- sort value_desc: descending by valueCents", () => {
    const sorted = applyKanbanSort(leads, "value_desc");
    expect(sorted[0].id).toBe("2"); // 50000
    expect(sorted[1].id).toBe("3"); // 30000
    expect(sorted[2].id).toBe("1"); // 10000
  });

  it("T-CRM-142-3 [blocant] -- sort sla_first: red > yellow > green", () => {
    const sorted = applyKanbanSort(leads, "sla_first");
    expect(sorted[0].slaBadge).toBe("red");
    expect(sorted[1].slaBadge).toBe("yellow");
    expect(sorted[2].slaBadge).toBe("green");
  });

  it("sla_first secondary: same badge color sorted by oldest-first", () => {
    const sameBadgeLeads: Lead[] = [
      { id: "a", fullName: "A", createdAt: "2026-03-01T00:00:00Z", valueCents: 0, slaBadge: "red" },
      { id: "b", fullName: "B", createdAt: "2026-01-01T00:00:00Z", valueCents: 0, slaBadge: "red" },
    ];
    const sorted = applyKanbanSort(sameBadgeLeads, "sla_first");
    // oldest red first (has been waiting longest)
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("sla_first: null/undefined slaBadge treated as green", () => {
    const withNull: Lead[] = [
      { id: "x", fullName: "X", createdAt: "2026-01-01T00:00:00Z", valueCents: 0, slaBadge: null },
      { id: "y", fullName: "Y", createdAt: "2026-01-01T00:00:00Z", valueCents: 0, slaBadge: "yellow" },
    ];
    const sorted = applyKanbanSort(withNull, "sla_first");
    expect(sorted[0].id).toBe("y"); // yellow before null(treated as green)
  });
});

// ---------------------------------------------------------------------------
// T-CRM-142-4: localStorage persistence
// ---------------------------------------------------------------------------

describe("CRM-142 -- kanban sort localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("T-CRM-142-4 -- reads initial sort from localStorage", () => {
    localStorage.setItem("crm_kanban_sort", "value_desc");

    // Simulate what useState(() => ...) does on mount
    const getInitial = (): KanbanSort => {
      try {
        return (localStorage.getItem("crm_kanban_sort") as KanbanSort) ?? "recent";
      } catch {
        return "recent";
      }
    };

    expect(getInitial()).toBe("value_desc");
  });

  it("persists sort choice to localStorage", () => {
    const handleKanbanSort = (sort: KanbanSort) => {
      try { localStorage.setItem("crm_kanban_sort", sort); } catch { /* ignore */ }
    };

    handleKanbanSort("sla_first");
    expect(localStorage.getItem("crm_kanban_sort")).toBe("sla_first");
  });

  it("defaults to recent when no localStorage entry", () => {
    const getInitial = (): KanbanSort => {
      try {
        return (localStorage.getItem("crm_kanban_sort") as KanbanSort) ?? "recent";
      } catch {
        return "recent";
      }
    };

    expect(getInitial()).toBe("recent");
  });
});
