/**
 * CRM-132 — Timeline filters
 * Tests: T-CRM-132-1..4
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TimelineFilters,
  computeFilterCounts,
  applyTimelineFilter,
  type TimelineFilterCounts,
} from "@/components/crm/TimelineFilters";
import type { LeadInteraction } from "@/lib/api/leads";

// ─── Helper: build a minimal interaction ─────────────────────────────────────

function makeInteraction(
  overrides: Partial<LeadInteraction>
): LeadInteraction {
  return {
    id: `i-${Math.random()}`,
    leadId: "lead-1",
    type: "note",
    direction: null,
    body: null,
    metadata: null,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── T-CRM-132-1: TimelineFilters renders correct buttons + counts ─────────

describe("TimelineFilters", () => {
  it("T-CRM-132-1 [blocant] renders 5 filter buttons with correct counts", () => {
    const counts: TimelineFilterCounts = {
      all: 5,
      note: 2,
      call: 1,
      commChannel: 1,
      stage_change: 1,
    };

    render(
      <TimelineFilters active="all" counts={counts} onChange={vi.fn()} />
    );

    // Should have 5 buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);

    // Button labels
    expect(screen.getByText("Toate")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("Apeluri")).toBeInTheDocument();
    expect(screen.getByText("Email+WA+SMS")).toBeInTheDocument();
    expect(screen.getByText("Stadiu")).toBeInTheDocument();

    // Count badges (for non-zero counts)
    expect(screen.getByLabelText("5 intrări")).toBeInTheDocument();
    expect(screen.getByLabelText("2 intrări")).toBeInTheDocument();
    expect(screen.getAllByLabelText("1 intrări")).toHaveLength(3);
  });

  it("active button has aria-pressed=true", () => {
    const counts: TimelineFilterCounts = {
      all: 3, note: 2, call: 1, commChannel: 0, stage_change: 0,
    };

    render(
      <TimelineFilters active="note" counts={counts} onChange={vi.fn()} />
    );

    const noteBtn = screen.getByText("Note").closest("button");
    expect(noteBtn?.getAttribute("aria-pressed")).toBe("true");

    const allBtn = screen.getByText("Toate").closest("button");
    expect(allBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onChange with correct filter when button clicked", () => {
    const onChange = vi.fn();
    const counts: TimelineFilterCounts = {
      all: 3, note: 0, call: 2, commChannel: 1, stage_change: 0,
    };

    render(<TimelineFilters active="all" counts={counts} onChange={onChange} />);

    fireEvent.click(screen.getByText("Apeluri"));
    expect(onChange).toHaveBeenCalledWith("call");
  });

  it("T-CRM-132-4 clicking 'Toate' after active filter resets correctly", () => {
    const onChange = vi.fn();
    const counts: TimelineFilterCounts = {
      all: 5, note: 2, call: 3, commChannel: 0, stage_change: 0,
    };

    render(<TimelineFilters active="call" counts={counts} onChange={onChange} />);

    fireEvent.click(screen.getByText("Toate"));
    expect(onChange).toHaveBeenCalledWith("all");
  });
});

// ─── computeFilterCounts ─────────────────────────────────────────────────────

describe("computeFilterCounts", () => {
  it("correctly counts each type", () => {
    const interactions = [
      makeInteraction({ type: "note" }),
      makeInteraction({ type: "note" }),
      makeInteraction({ type: "call" }),
      makeInteraction({ type: "email" }),
      makeInteraction({ type: "whatsapp" }),
      makeInteraction({ type: "sms" }),
      makeInteraction({ type: "stage_change" }),
      makeInteraction({ type: "system" }),
    ];

    const counts = computeFilterCounts(interactions);
    expect(counts.all).toBe(8);
    expect(counts.note).toBe(2);
    expect(counts.call).toBe(1);
    expect(counts.commChannel).toBe(3); // email + whatsapp + sms
    expect(counts.stage_change).toBe(1);
    // "system" doesn't map to any bucket — total is 8 but buckets sum to 7 (correct)
  });
});

// ─── applyTimelineFilter ─────────────────────────────────────────────────────

describe("applyTimelineFilter", () => {
  it("T-CRM-132-2 [blocant] filter 'call' returns only call interactions", () => {
    const interactions = [
      makeInteraction({ id: "i1", type: "call" }),
      makeInteraction({ id: "i2", type: "note" }),
      makeInteraction({ id: "i3", type: "note" }),
    ];

    const filtered = applyTimelineFilter(interactions, "call");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("i1");
  });

  it("T-CRM-132-3 [blocant] filter with 0 results returns empty array", () => {
    const interactions = [
      makeInteraction({ type: "call" }),
      makeInteraction({ type: "stage_change" }),
    ];

    const filtered = applyTimelineFilter(interactions, "note");
    expect(filtered).toHaveLength(0);
  });

  it("optimistic entries always pass through the filter", () => {
    const interactions = [
      makeInteraction({ id: "opt-1", type: "note", optimistic: true }),
      makeInteraction({ id: "real-1", type: "note" }),
      makeInteraction({ id: "real-2", type: "call" }),
    ];

    const filtered = applyTimelineFilter(interactions, "call");
    // Should include the call AND the optimistic note
    expect(filtered).toHaveLength(2);
    expect(filtered.find((i) => i.id === "opt-1")).toBeDefined();
    expect(filtered.find((i) => i.id === "real-2")).toBeDefined();
  });

  it("filter 'commChannel' matches email + whatsapp + sms", () => {
    const interactions = [
      makeInteraction({ id: "e1", type: "email" }),
      makeInteraction({ id: "w1", type: "whatsapp" }),
      makeInteraction({ id: "s1", type: "sms" }),
      makeInteraction({ id: "n1", type: "note" }),
    ];

    const filtered = applyTimelineFilter(interactions, "commChannel");
    expect(filtered).toHaveLength(3);
  });

  it("filter 'all' returns all interactions", () => {
    const interactions = [
      makeInteraction({ type: "note" }),
      makeInteraction({ type: "call" }),
      makeInteraction({ type: "stage_change" }),
    ];

    const filtered = applyTimelineFilter(interactions, "all");
    expect(filtered).toHaveLength(3);
  });
});
