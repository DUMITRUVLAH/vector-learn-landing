/**
 * Regression: resolveApprovalChain must NEVER return an empty chain. Before this, a PAR submitted by a
 * tenant with no matching DOA rule got status "pending_approval" + ZERO approval steps → stuck forever,
 * invisible in every approver inbox (owner-reported: PAR "În aprobare", inbox empty). The fallback adds
 * one role-based approver step (approverUserId=null → any approver/par_admin can decide).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../db/client", () => ({
  db: {
    // resolveApprovalChain does db.select().from().where() → resolve to NO matrix rows
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  },
}));

import { resolveApprovalChain } from "../doa";

describe("resolveApprovalChain — empty-DOA fallback", () => {
  it("returns exactly ONE role-based approver step when no DOA rule matches", async () => {
    const chain = await resolveApprovalChain({ tenantId: "t1", totalCents: 700000 });
    expect(chain).toHaveLength(1);
    expect(chain[0].step).toBe(1);
    expect(chain[0].approverUserId).toBeNull(); // role-based → any approver/par_admin
    expect(chain[0].approverParRole).toBe("approver");
  });

  it("still falls back for a tiny amount (no silent zero-step chain)", async () => {
    const chain = await resolveApprovalChain({ tenantId: "t1", totalCents: 1 });
    expect(chain).toHaveLength(1);
    expect(chain[0].approverUserId).toBeNull();
  });
});
