/**
 * VM1-10: ParFolders — aggregation unit tests
 *
 * T-VM1-10-1 [blocant] Given requests on 2 projects, folder shows correct counts
 * T-VM1-10-2 [blocant] Status transitions: approved → paid moves between buckets
 * T-VM1-10-3 [normal] Mixed currencies: MDL total uses totalMdlCents
 * T-VM1-10-4 [normal] projectId=null requests appear in "Fără proiect" bucket
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

// ─── Inline the aggregation logic to test it in isolation ─────────────────────

type FolderStatus = "pending_approval" | "approved_in_finance" | "paid";

interface FolderBucket {
  status: FolderStatus;
  label: string;
  statuses: string[];
  count: number;
  totalMdlCents: number;
}

interface ProjectFolder {
  projectId: string | null;
  projectName: string;
  totalCount: number;
  totalMdlCents: number;
  buckets: FolderBucket[];
}

const FOLDER_DEFS: { status: FolderStatus; label: string; statuses: string[] }[] = [
  { status: "pending_approval", label: "De aprobat", statuses: ["pending_approval", "changes_requested", "reapproval_required"] },
  { status: "approved_in_finance", label: "Aprobate", statuses: ["approved", "in_finance"] },
  { status: "paid", label: "Plătite", statuses: ["paid"] },
];

type ParRow = {
  id: string;
  projectId: string | null;
  status: string;
  totalEstimatedCents: number;
  totalMdlCents?: number | null;
  currency: string;
};

function buildBuckets(rows: ParRow[]): FolderBucket[] {
  return FOLDER_DEFS.map((def) => {
    const matching = rows.filter((r) => def.statuses.includes(r.status));
    return {
      ...def,
      count: matching.length,
      totalMdlCents: matching.reduce((s, r) => s + (r.totalMdlCents ?? r.totalEstimatedCents), 0),
    };
  }).filter((b) => b.count > 0);
}

function buildFolders(requests: ParRow[]): ProjectFolder[] {
  const groups = new Map<string | null, ParRow[]>([[null, []]]);
  for (const r of requests) {
    const key = r.projectId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return [...groups.entries()].map(([projectId, rows]) => ({
    projectId,
    projectName: projectId === null ? "Fără proiect" : `Project ${projectId}`,
    totalCount: rows.length,
    totalMdlCents: rows.reduce((s, r) => s + (r.totalMdlCents ?? r.totalEstimatedCents), 0),
    buckets: buildBuckets(rows),
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VM1-10: ParFolders aggregation", () => {
  it("T-VM1-10-1 [blocant] shows correct counts per status bucket per project", () => {
    const requests: ParRow[] = [
      { id: "p1", projectId: "proj-A", status: "pending_approval", totalEstimatedCents: 10000, currency: "MDL" },
      { id: "p2", projectId: "proj-A", status: "approved", totalEstimatedCents: 20000, currency: "MDL" },
      { id: "p3", projectId: "proj-A", status: "paid", totalEstimatedCents: 30000, currency: "MDL" },
      { id: "p4", projectId: "proj-B", status: "pending_approval", totalEstimatedCents: 5000, currency: "MDL" },
      { id: "p5", projectId: "proj-B", status: "in_finance", totalEstimatedCents: 5000, currency: "MDL" },
    ];

    const folders = buildFolders(requests);
    const projA = folders.find((f) => f.projectId === "proj-A")!;
    const projB = folders.find((f) => f.projectId === "proj-B")!;

    expect(projA).toBeDefined();
    expect(projA.totalCount).toBe(3);

    const pendingBucket = projA.buckets.find((b) => b.status === "pending_approval")!;
    expect(pendingBucket.count).toBe(1);

    const approvedBucket = projA.buckets.find((b) => b.status === "approved_in_finance")!;
    expect(approvedBucket.count).toBe(1);

    const paidBucket = projA.buckets.find((b) => b.status === "paid")!;
    expect(paidBucket.count).toBe(1);

    expect(projB.totalCount).toBe(2);
    const projBPending = projB.buckets.find((b) => b.status === "pending_approval")!;
    const projBApproved = projB.buckets.find((b) => b.status === "approved_in_finance")!;
    expect(projBPending.count).toBe(1);
    expect(projBApproved.count).toBe(1);
  });

  it("T-VM1-10-2 [blocant] approved → paid moves request between folder buckets", () => {
    // Simulate: initially approved, then paid
    const approvedRequests: ParRow[] = [
      { id: "r1", projectId: "proj-A", status: "approved", totalEstimatedCents: 50000, currency: "MDL" },
    ];
    const paidRequests: ParRow[] = [
      { id: "r1", projectId: "proj-A", status: "paid", totalEstimatedCents: 50000, currency: "MDL" },
    ];

    const foldersApproved = buildFolders(approvedRequests);
    const foldersPaid = buildFolders(paidRequests);

    const projApproved = foldersApproved.find((f) => f.projectId === "proj-A")!;
    const projPaid = foldersPaid.find((f) => f.projectId === "proj-A")!;

    // Before payment: should be in "Aprobate"
    expect(projApproved.buckets.some((b) => b.status === "approved_in_finance" && b.count === 1)).toBe(true);
    expect(projApproved.buckets.some((b) => b.status === "paid")).toBe(false);

    // After payment: should be in "Plătite"
    expect(projPaid.buckets.some((b) => b.status === "paid" && b.count === 1)).toBe(true);
    expect(projPaid.buckets.some((b) => b.status === "approved_in_finance")).toBe(false);
  });

  it("T-VM1-10-3 [normal] MDL total uses totalMdlCents, not totalEstimatedCents for foreign currencies", () => {
    const requests: ParRow[] = [
      // EUR PAR: estimated 1000 EUR cents, but MDL equivalent is 17000 MDL cents
      { id: "r1", projectId: "proj-A", status: "approved", totalEstimatedCents: 1000, totalMdlCents: 17000, currency: "EUR" },
      // MDL PAR: no totalMdlCents, falls back to totalEstimatedCents
      { id: "r2", projectId: "proj-A", status: "approved", totalEstimatedCents: 5000, totalMdlCents: null, currency: "MDL" },
    ];

    const folders = buildFolders(requests);
    const proj = folders.find((f) => f.projectId === "proj-A")!;

    // Total MDL should be 17000 + 5000 = 22000
    expect(proj.totalMdlCents).toBe(22000);
    const approvedBucket = proj.buckets.find((b) => b.status === "approved_in_finance")!;
    expect(approvedBucket.totalMdlCents).toBe(22000);
  });

  it("T-VM1-10-4 [normal] projectId=null requests appear in 'Fără proiect' bucket", () => {
    const requests: ParRow[] = [
      { id: "r1", projectId: null, status: "pending_approval", totalEstimatedCents: 3000, currency: "MDL" },
      { id: "r2", projectId: null, status: "paid", totalEstimatedCents: 7000, currency: "MDL" },
      { id: "r3", projectId: "proj-A", status: "pending_approval", totalEstimatedCents: 1000, currency: "MDL" },
    ];

    const folders = buildFolders(requests);
    const noProject = folders.find((f) => f.projectId === null)!;

    expect(noProject).toBeDefined();
    expect(noProject.projectName).toBe("Fără proiect");
    expect(noProject.totalCount).toBe(2);
    expect(noProject.totalMdlCents).toBe(10000);
  });
});
