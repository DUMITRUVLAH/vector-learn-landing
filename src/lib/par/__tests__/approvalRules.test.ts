/**
 * Approval-rule builder ↔ DOA rows mapping (financial-critical).
 * Locks the engine contract: sequential → steps 1..N; parallel → all on step 1.
 */
import { describe, it, expect } from "vitest";
import { buildDoaRows, groupDoaRows, ruleScopeKey, type RuleDraft } from "../approvalRules";
import type { ParDoaRow } from "@/lib/api/par";

const baseDraft = (over: Partial<RuleDraft>): RuleDraft => ({
  payerId: "pay-1", projectId: "proj-1", departmentId: null, chargeTo: null,
  minAmountCents: 0, maxAmountCents: null, mode: "sequential", approvers: [], ...over,
});

const pick = (userId: string, label: string) => ({ userId, parRole: null, label });

describe("buildDoaRows", () => {
  it("sequential → one row per approver with steps 1..N", () => {
    const rows = buildDoaRows(baseDraft({
      mode: "sequential",
      approvers: [pick("u1", "Ana"), pick("u2", "Bob"), pick("u3", "Cyn")],
    }));
    expect(rows.map((r) => r.step)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.approverUserId)).toEqual(["u1", "u2", "u3"]);
    expect(rows.every((r) => r.approvalMode === "sequential")).toBe(true);
  });

  it("parallel → every approver on step 1, mode parallel", () => {
    const rows = buildDoaRows(baseDraft({
      mode: "parallel",
      approvers: [pick("u1", "Ana"), pick("u2", "Bob")],
    }));
    expect(rows.map((r) => r.step)).toEqual([1, 1]);
    expect(rows.every((r) => r.approvalMode === "parallel")).toBe(true);
  });

  it("single approver → one row, step 1", () => {
    const rows = buildDoaRows(baseDraft({ mode: "sequential", approvers: [pick("u1", "Ana")] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].step).toBe(1);
  });

  it("propagates scope (payer/project/amount) and role-based approvers", () => {
    const rows = buildDoaRows(baseDraft({
      payerId: "pay-9", projectId: "proj-9", minAmountCents: 500000, maxAmountCents: 900000,
      approvers: [{ userId: null, parRole: "approver", label: "Oricine · Approver" }],
    }));
    expect(rows[0]).toMatchObject({
      payerId: "pay-9", projectId: "proj-9", minAmountCents: 500000, maxAmountCents: 900000,
      approverUserId: null, approverParRole: "approver",
    });
  });

  it("empty label falls back to 'Aprobator'", () => {
    const rows = buildDoaRows(baseDraft({ approvers: [{ userId: "u1", parRole: null, label: "" }] }));
    expect(rows[0].approverRoleLabel).toBe("Aprobator");
  });
});

// Helper to fake persisted rows from payloads (add ids the DB would assign).
const persist = (payloads: ReturnType<typeof buildDoaRows>): ParDoaRow[] =>
  payloads.map((p, i) => ({ ...p, id: `row-${i}`, tenantId: "t-1", createdAt: "", updatedAt: "" } as ParDoaRow));

describe("groupDoaRows", () => {
  it("groups sequential rows into one rule and infers the order", () => {
    const rows = persist(buildDoaRows(baseDraft({
      mode: "sequential", approvers: [pick("u1", "Ana"), pick("u2", "Bob")],
    })));
    const groups = groupDoaRows(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].draft.mode).toBe("sequential");
    expect(groups[0].draft.approvers.map((a) => a.userId)).toEqual(["u1", "u2"]);
  });

  it("infers parallel when all approvers share step 1", () => {
    const rows = persist(buildDoaRows(baseDraft({
      mode: "parallel", approvers: [pick("u1", "Ana"), pick("u2", "Bob")],
    })));
    expect(groupDoaRows(rows)[0].draft.mode).toBe("parallel");
  });

  it("keeps different scopes as separate rules", () => {
    const rows = [
      ...persist(buildDoaRows(baseDraft({ projectId: "proj-1", approvers: [pick("u1", "Ana")] }))),
      ...persist(buildDoaRows(baseDraft({ projectId: "proj-2", approvers: [pick("u2", "Bob")] }))),
    ];
    expect(new Set(groupDoaRows(rows).map((g) => g.key)).size).toBe(2);
  });

  it("round-trips: build → persist → group reproduces the draft", () => {
    const draft = baseDraft({ mode: "sequential", approvers: [pick("u1", "Ana"), pick("u2", "Bob"), pick("u3", "Cyn")] });
    const groups = groupDoaRows(persist(buildDoaRows(draft)));
    expect(groups[0].draft.mode).toBe(draft.mode);
    expect(groups[0].draft.approvers.map((a) => a.userId)).toEqual(["u1", "u2", "u3"]);
  });

  it("ruleScopeKey distinguishes payer/project/amount", () => {
    expect(ruleScopeKey({ payerId: "a", projectId: "b", departmentId: null, chargeTo: null, minAmountCents: 0, maxAmountCents: null }))
      .not.toBe(ruleScopeKey({ payerId: "a", projectId: "b", departmentId: null, chargeTo: null, minAmountCents: 100, maxAmountCents: null }));
  });
});
