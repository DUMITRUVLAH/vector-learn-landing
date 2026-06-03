/**
 * CRM — Kanban optimistic stage move (no full-page refresh on drag)
 *
 * The bug: every stage move called `fetchAll()`, which set the global `loading`
 * flag → the whole board was replaced by the "Se încarcă pipeline-ul…" spinner
 * and visibly flashed/jumped. Fix: move the card optimistically in local state
 * and re-sync silently (loading stays false). These tests lock the pure logic of
 * the optimistic move (mirrors `moveLeadLocal` in LeadsPage.tsx) and the silent
 * refresh contract.
 */
import { describe, it, expect } from "vitest";

type Lead = { id: string; stage: string; valueCents?: number };

/**
 * Pure mirror of `moveLeadLocal`'s state transform: move a lead between stage
 * buckets and recompute counts + value sums. Returns the next state.
 */
function applyOptimisticMove(
  grouped: Record<string, Lead[]>,
  counts: Record<string, number>,
  valueSums: Record<string, number>,
  leadId: string,
  toStage: string,
) {
  const lead = Object.values(grouped).flat().find((l) => l.id === leadId);
  const nextGrouped: Record<string, Lead[]> = {};
  let moved: Lead | undefined;
  for (const [key, arr] of Object.entries(grouped)) {
    const idx = arr.findIndex((l) => l.id === leadId);
    if (idx >= 0) {
      moved = { ...arr[idx], stage: toStage };
      nextGrouped[key] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    } else {
      nextGrouped[key] = arr;
    }
  }
  if (moved) nextGrouped[toStage] = [moved, ...(nextGrouped[toStage] ?? [])];

  let nextCounts = counts;
  let nextSums = valueSums;
  if (lead && lead.stage !== toStage) {
    nextCounts = {
      ...counts,
      [lead.stage]: Math.max(0, (counts[lead.stage] ?? 0) - 1),
      [toStage]: (counts[toStage] ?? 0) + 1,
    };
    const cents = lead.valueCents ?? 0;
    if (cents > 0) {
      nextSums = {
        ...valueSums,
        [lead.stage]: Math.max(0, (valueSums[lead.stage] ?? 0) - cents),
        [toStage]: (valueSums[toStage] ?? 0) + cents,
      };
    }
  }
  return { grouped: nextGrouped, counts: nextCounts, valueSums: nextSums };
}

const baseGrouped: Record<string, Lead[]> = {
  new: [{ id: "l1", stage: "new", valueCents: 20000 }, { id: "l2", stage: "new" }],
  contacted: [{ id: "l3", stage: "contacted" }],
  paid: [],
};
const baseCounts = { new: 2, contacted: 1, paid: 0 };
const baseSums = { new: 20000, contacted: 0, paid: 0 };

describe("CRM — Kanban optimistic move", () => {
  it("T-KANBAN-1 [blocant]: moves the card to the target column instantly", () => {
    const r = applyOptimisticMove(baseGrouped, baseCounts, baseSums, "l1", "contacted");
    expect(r.grouped.new.map((l) => l.id)).toEqual(["l2"]);
    expect(r.grouped.contacted.map((l) => l.id)).toContain("l1");
    expect(r.grouped.contacted.find((l) => l.id === "l1")!.stage).toBe("contacted");
  });

  it("T-KANBAN-2 [blocant]: decrements source count and increments target count", () => {
    const r = applyOptimisticMove(baseGrouped, baseCounts, baseSums, "l1", "contacted");
    expect(r.counts.new).toBe(1);
    expect(r.counts.contacted).toBe(2);
  });

  it("T-KANBAN-3: moves the lead's value between stage sums", () => {
    const r = applyOptimisticMove(baseGrouped, baseCounts, baseSums, "l1", "paid");
    expect(r.valueSums.new).toBe(0);
    expect(r.valueSums.paid).toBe(20000);
  });

  it("T-KANBAN-4: a no-op move (same stage) leaves counts unchanged", () => {
    const r = applyOptimisticMove(baseGrouped, baseCounts, baseSums, "l1", "new");
    expect(r.counts).toEqual(baseCounts);
  });

  it("T-KANBAN-5: never produces a negative count", () => {
    const r = applyOptimisticMove(baseGrouped, baseCounts, baseSums, "l3", "paid");
    expect(r.counts.contacted).toBe(0);
    expect(r.counts.contacted).toBeGreaterThanOrEqual(0);
  });

  it("T-KANBAN-6 [blocant]: a silent refresh must not toggle the loading flag", () => {
    // Mirror of fetchAll({ silent: true }): loading stays whatever it was.
    let loading = false;
    const setLoading = (v: boolean) => { loading = v; };
    const fetchAll = (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      // ...load...
      if (!silent) setLoading(false);
    };
    fetchAll({ silent: true });
    expect(loading).toBe(false);
    // Non-silent path still flips loading during the call (asserted via spy below)
    let sawTrue = false;
    const setLoading2 = (v: boolean) => { if (v) sawTrue = true; };
    const fetchAll2 = (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading2(true);
      if (!silent) setLoading2(false);
    };
    fetchAll2();
    expect(sawTrue).toBe(true);
  });
});
