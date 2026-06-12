/**
 * PAR-111: Notification service unit tests
 *
 * Test scenarios:
 *   T-PAR-111-1 [blocant] Given submit, Then first approver receives in-app notification
 *   T-PAR-111-2 [blocant] Given final approval (execute_payment), Then finance users notified
 *   T-PAR-111-3 [normal] Given reject, Then requestor receives notification with reason
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (must use vi.mock at top level — hoisted by vitest) ───────────────

const mockValues = vi.fn().mockResolvedValue(undefined);
const mockInsertFn = vi.fn().mockReturnValue({ values: mockValues });

const mockSelectChainWhere = vi.fn().mockResolvedValue([]);
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: mockSelectChainWhere,
};
const mockSelectFn = vi.fn().mockReturnValue(mockSelectChain);

vi.mock("../../../db/client", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsertFn(...args),
    select: (...args: unknown[]) => mockSelectFn(...args),
  },
}));

vi.mock("../../messaging/index", () => ({
  MessagingService: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => `${String(a)}=${String(b)}`),
  inArray: vi.fn((a: unknown, b: unknown) => `${String(a)}_in_${JSON.stringify(b)}`),
}));

import {
  notifySubmitted,
  notifyStepAdvanced,
  notifyFullyApprovedToFinance,
  notifyRejected,
  notifyChangesRequested,
  notifyPaid,
} from "../notify";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ctx = {
  tenantId: "tenant-001",
  parId: "par-001",
  requestNo: "PAR-2026-0001",
};

// ─── T-PAR-111-1: submit → first approver notified ───────────────────────────

describe("PAR-111 notifySubmitted (T-PAR-111-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("calls db.insert with approver userId when specific approver given", async () => {
    await notifySubmitted(ctx, "user-approver-1");

    expect(mockInsertFn).toHaveBeenCalled();
    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      kind: string;
      payload: { par_id: string; body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-approver-1");
    expect(insertArg.kind).toBe("par");
    expect(insertArg.payload.par_id).toBe("par-001");
    expect(insertArg.payload.body).toContain("PAR-2026-0001");
    expect(insertArg.payload.body).toContain("awaits your approval");
  });

  it("body contains link to /app/par/:id", async () => {
    await notifySubmitted(ctx, "user-approver-1");

    const insertArg = mockValues.mock.calls[0][0] as {
      payload: { body: string };
    };
    expect(insertArg.payload.body).toContain(`/app/par/${ctx.parId}`);
  });

  it("does not throw when approverUserId is null (role-based routing)", async () => {
    // select returns [] (no approvers) — should still not throw
    await expect(notifySubmitted(ctx, null)).resolves.not.toThrow();
  });
});

// ─── T-PAR-111-2: final approval → finance notified ──────────────────────────

describe("PAR-111 notifyFullyApprovedToFinance (T-PAR-111-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("resolves without throw when no finance users found", async () => {
    await expect(notifyFullyApprovedToFinance(ctx)).resolves.not.toThrow();
  });

  it("sends in-app notification to each finance user when present", async () => {
    const financeUsers = [{ userId: "finance-user-1" }, { userId: "finance-user-2" }];
    // First select call returns finance users; subsequent calls return []
    mockSelectChainWhere
      .mockResolvedValueOnce(financeUsers) // parMembers for finance role
      .mockResolvedValue([]); // users lookup returns empty → no email

    await notifyFullyApprovedToFinance(ctx);

    const recipientIds = mockValues.mock.calls.map(
      (c) => (c[0] as { recipientUserId: string }).recipientUserId
    );
    expect(recipientIds).toContain("finance-user-1");
    expect(recipientIds).toContain("finance-user-2");
  });
});

// ─── T-PAR-111-3: reject → requestor notified with reason ────────────────────

describe("PAR-111 notifyRejected (T-PAR-111-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends in-app notification to requestor with rejection reason", async () => {
    await notifyRejected(ctx, "user-requestor-1", "Budget not approved");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string; par_id: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    expect(insertArg.payload.body).toContain("Budget not approved");
    expect(insertArg.payload.par_id).toBe("par-001");
  });

  it("truncates long rejection comments to 500 chars in the notification body", async () => {
    const longComment = "x".repeat(1000);
    await notifyRejected(ctx, "user-requestor-1", longComment);

    const insertArg = mockValues.mock.calls[0][0] as {
      payload: { body: string };
    };
    // The body should not contain 1000 x's (truncated)
    const bodyX = (insertArg.payload.body.match(/x/g) ?? []).length;
    expect(bodyX).toBeLessThanOrEqual(500);
  });
});

// ─── Additional scenarios ─────────────────────────────────────────────────────

describe("PAR-111 notifyChangesRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends notification to requestor with changes comment", async () => {
    await notifyChangesRequested(ctx, "user-requestor-1", "Add more detail to line 1");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    expect(insertArg.payload.body).toContain("Add more detail to line 1");
  });
});

describe("PAR-111 notifyPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("notifies requestor when PAR is paid", async () => {
    await notifyPaid(ctx, "user-requestor-1");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-requestor-1");
    expect(insertArg.payload.body).toContain("paid");
  });
});

describe("PAR-111 notifyStepAdvanced", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockResolvedValue(undefined);
    mockInsertFn.mockReturnValue({ values: mockValues });
    mockSelectChainWhere.mockResolvedValue([]);
    mockSelectChain.from.mockReturnThis();
    mockSelectFn.mockReturnValue(mockSelectChain);
  });

  it("sends notification to next approver when specific user assigned", async () => {
    await notifyStepAdvanced(ctx, "user-approver-2", "Executive Director");

    const insertArg = mockValues.mock.calls[0][0] as {
      recipientUserId: string;
      payload: { body: string };
    };
    expect(insertArg.recipientUserId).toBe("user-approver-2");
    expect(insertArg.payload.body).toContain("Executive Director");
  });

  it("does not throw when next approver is null (role-based)", async () => {
    await expect(notifyStepAdvanced(ctx, null, "Executive Director")).resolves.not.toThrow();
  });
});
