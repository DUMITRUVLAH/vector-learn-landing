/**
 * VM1-01 — Multiple roles per person in ParAdmin members UI tests
 *
 * T-VM1-01-1 [blocant] groupMembers groups multiple roles for same userId into one entry
 * T-VM1-01-2 [blocant] groupMembers produces separate entries for different users
 * T-VM1-01-3 [normal]  approvalLimit picks approver's limit preferentially
 * T-VM1-01-4 [normal]  person with 4 roles all visible in one group
 */
import { describe, it, expect } from "vitest";

interface ParMember {
  id: string;
  userId: string;
  role: "requestor" | "approver" | "finance" | "par_admin";
  approvalLimitCents: number | null;
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

interface GroupedMember {
  userId: string;
  userName?: string;
  userEmail?: string;
  roles: Array<{ id: string; role: ParMember["role"]; approvalLimitCents: number | null }>;
}

// Inline the groupMembers logic to test it independently
function groupMembers(members: ParMember[]): GroupedMember[] {
  const map = new Map<string, GroupedMember>();
  for (const m of members) {
    const existing = map.get(m.userId);
    const roleEntry = { id: m.id, role: m.role, approvalLimitCents: m.approvalLimitCents };
    if (existing) {
      existing.roles.push(roleEntry);
    } else {
      map.set(m.userId, {
        userId: m.userId,
        userName: m.userName,
        userEmail: m.userEmail,
        roles: [roleEntry],
      });
    }
  }
  return Array.from(map.values());
}

const user1 = "user-111";
const user2 = "user-222";

describe("VM1-01 groupMembers", () => {
  it("T-VM1-01-1 [blocant] same userId → single grouped entry with multiple roles", () => {
    const members: ParMember[] = [
      { id: "m1", userId: user1, role: "requestor", approvalLimitCents: null, createdAt: "", userName: "Ana" },
      { id: "m2", userId: user1, role: "approver", approvalLimitCents: 500000, createdAt: "", userName: "Ana" },
    ];
    const grouped = groupMembers(members);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].userId).toBe(user1);
    expect(grouped[0].roles).toHaveLength(2);
    expect(grouped[0].roles.map((r) => r.role)).toContain("requestor");
    expect(grouped[0].roles.map((r) => r.role)).toContain("approver");
  });

  it("T-VM1-01-2 [blocant] different userIds → separate entries", () => {
    const members: ParMember[] = [
      { id: "m1", userId: user1, role: "requestor", approvalLimitCents: null, createdAt: "", userName: "Ana" },
      { id: "m2", userId: user2, role: "approver", approvalLimitCents: 200000, createdAt: "", userName: "Bogdan" },
    ];
    const grouped = groupMembers(members);
    expect(grouped).toHaveLength(2);
    expect(grouped.map((g) => g.userId)).toContain(user1);
    expect(grouped.map((g) => g.userId)).toContain(user2);
  });

  it("T-VM1-01-3 [normal] approvalLimit: approver limit preferred over other roles", () => {
    const members: ParMember[] = [
      { id: "m1", userId: user1, role: "requestor", approvalLimitCents: null, createdAt: "", userName: "Ana" },
      { id: "m2", userId: user1, role: "approver", approvalLimitCents: 500000, createdAt: "", userName: "Ana" },
    ];
    const grouped = groupMembers(members);
    const g = grouped[0];
    const approverRole = g.roles.find((r) => r.role === "approver");
    const limitEntry = approverRole ?? g.roles.find((r) => r.approvalLimitCents != null);
    expect(limitEntry?.approvalLimitCents).toBe(500000);
  });

  it("T-VM1-01-4 [normal] person with all 4 roles → 4 entries in roles array", () => {
    const members: ParMember[] = [
      { id: "m1", userId: user1, role: "requestor", approvalLimitCents: null, createdAt: "", userName: "Superuser" },
      { id: "m2", userId: user1, role: "approver", approvalLimitCents: 1000000, createdAt: "", userName: "Superuser" },
      { id: "m3", userId: user1, role: "finance", approvalLimitCents: null, createdAt: "", userName: "Superuser" },
      { id: "m4", userId: user1, role: "par_admin", approvalLimitCents: null, createdAt: "", userName: "Superuser" },
    ];
    const grouped = groupMembers(members);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].roles).toHaveLength(4);
    expect(grouped[0].userName).toBe("Superuser");
  });
});
