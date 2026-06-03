/**
 * CX — Send feedback to a whole cohort (no migration; reuses feedback_invitations)
 *
 * The flow: collect the cohort's CRM-linked participants (those with a studentId),
 * skip students already invited for this form, bulk-create invitations for the rest.
 * These tests lock that selection/dedup logic (mirrors /api/feedback/:id/send-cohort).
 */
import { describe, it, expect } from "vitest";

type Participant = { studentId: string | null };

/** Mirror of the server's student-selection + dedup for cohort feedback send. */
function planCohortInvites(
  participants: Participant[],
  alreadyInvitedStudentIds: string[],
): { toInvite: string[]; skipped: number; total: number; reason?: string } {
  const studentIds = [...new Set(participants.map((p) => p.studentId).filter((s): s is string => !!s))];
  if (studentIds.length === 0) {
    return { toInvite: [], skipped: 0, total: 0, reason: "no_linked_students" };
  }
  const already = new Set(alreadyInvitedStudentIds);
  const toInvite = studentIds.filter((id) => !already.has(id));
  return { toInvite, skipped: studentIds.length - toInvite.length, total: studentIds.length };
}

describe("CX — cohort feedback send", () => {
  it("T-CXFB-1 [blocant]: invites every CRM-linked participant", () => {
    const plan = planCohortInvites([{ studentId: "s1" }, { studentId: "s2" }], []);
    expect(plan.toInvite.sort()).toEqual(["s1", "s2"]);
    expect(plan.total).toBe(2);
  });

  it("T-CXFB-2 [blocant]: skips participants with no linked student (manual entries)", () => {
    const plan = planCohortInvites([{ studentId: "s1" }, { studentId: null }], []);
    expect(plan.toInvite).toEqual(["s1"]);
    expect(plan.total).toBe(1);
  });

  it("T-CXFB-3 [blocant]: is idempotent — already-invited students are skipped", () => {
    const plan = planCohortInvites([{ studentId: "s1" }, { studentId: "s2" }], ["s1"]);
    expect(plan.toInvite).toEqual(["s2"]);
    expect(plan.skipped).toBe(1);
  });

  it("T-CXFB-4: de-duplicates a student appearing twice in the cohort", () => {
    const plan = planCohortInvites([{ studentId: "s1" }, { studentId: "s1" }], []);
    expect(plan.toInvite).toEqual(["s1"]);
    expect(plan.total).toBe(1);
  });

  it("T-CXFB-5: a cohort with only manual participants reports no_linked_students", () => {
    const plan = planCohortInvites([{ studentId: null }, { studentId: null }], []);
    expect(plan.reason).toBe("no_linked_students");
    expect(plan.toInvite).toEqual([]);
  });

  it("T-CXFB-6: re-sending when everyone is already invited creates nothing", () => {
    const plan = planCohortInvites([{ studentId: "s1" }, { studentId: "s2" }], ["s1", "s2"]);
    expect(plan.toInvite).toEqual([]);
    expect(plan.skipped).toBe(2);
  });
});
