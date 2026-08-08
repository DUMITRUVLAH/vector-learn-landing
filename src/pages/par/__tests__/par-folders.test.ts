/**
 * VM1-10 / VM1-10b: Foldere PAR — navigation + aggregation.
 *
 * These tests import the SHIPPED module (`@/lib/par/folders`). The previous version re-declared
 * `buildFolders` inline in this file, so it validated a copy that could (and did) drift from the
 * code the page actually ran — CLAUDE.md §3.5.1quater.
 *
 * T-VM1-10-1 [blocant] Given requests on 2 projects, folder shows correct counts
 * T-VM1-10-2 [blocant] Status transitions: approved → paid moves between buckets
 * T-VM1-10-3 [normal]  Mixed currencies: MDL total uses totalMdlCents
 * T-VM1-10-4 [normal]  projectId=null requests appear in "Fără proiect"
 * T-VM1-10b-1 [blocant] URL ⇄ location round-trip drives the drive-style levels
 * T-VM1-10b-2 [blocant] Every request lands in exactly one bucket (counts add up to the total)
 * T-VM1-10b-3 [normal]  Breadcrumb + parent give a walkable path back to the root
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import type { ParEvent, ParListRow, ParProject } from "@/lib/api/par";
import {
  buildBreadcrumb,
  buildBuckets,
  buildEventFolders,
  buildFolderHref,
  buildProjectFolders,
  levelOf,
  parentLocation,
  parseFolderLocation,
  scopeRows,
  sumMdlCents,
} from "@/lib/par/folders";

// ─── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
function row(partial: Partial<ParListRow> & { status: string; projectId: string | null }): ParListRow {
  seq += 1;
  return {
    id: partial.id ?? `par-${seq}`,
    requestNo: partial.requestNo ?? `PAR-2026-000${seq}`,
    totalEstimatedCents: 0,
    totalMdlCents: null,
    currency: "MDL",
    eventId: null,
    payeeName: null,
    endUse: null,
    ...partial,
  } as ParListRow;
}

const project = (id: string, name: string): ParProject =>
  ({ id, name, payerId: null, donor: null, active: true }) as ParProject;

const event = (id: string, projectId: string, name: string): ParEvent =>
  ({ id, projectId, name, active: true }) as ParEvent;

// ─── Aggregation ─────────────────────────────────────────────────────────────

describe("VM1-10: Foldere PAR — agregare", () => {
  it("T-VM1-10-1 [blocant] shows correct counts per status bucket per project", () => {
    const rows = [
      row({ projectId: "proj-A", status: "pending_approval", totalEstimatedCents: 10000 }),
      row({ projectId: "proj-A", status: "approved", totalEstimatedCents: 20000 }),
      row({ projectId: "proj-A", status: "paid", totalEstimatedCents: 30000 }),
      row({ projectId: "proj-B", status: "pending_approval", totalEstimatedCents: 5000 }),
      row({ projectId: "proj-B", status: "in_finance", totalEstimatedCents: 5000 }),
    ];
    const folders = buildProjectFolders(rows, [project("proj-A", "ATIC"), project("proj-B", "Tekwill")]);

    const projA = folders.find((f) => f.projectId === "proj-A")!;
    const projB = folders.find((f) => f.projectId === "proj-B")!;

    expect(projA.count).toBe(3);
    expect(projA.buckets.find((b) => b.key === "pending")!.count).toBe(1);
    expect(projA.buckets.find((b) => b.key === "approved")!.count).toBe(1);
    expect(projA.buckets.find((b) => b.key === "paid")!.count).toBe(1);

    expect(projB.count).toBe(2);
    expect(projB.buckets.find((b) => b.key === "pending")!.count).toBe(1);
    // approved + in_finance share the "Aprobate" folder
    expect(projB.buckets.find((b) => b.key === "approved")!.count).toBe(1);
  });

  it("T-VM1-10-2 [blocant] approved → paid moves the request between folders", () => {
    const before = buildBuckets([row({ projectId: "proj-A", status: "approved", totalEstimatedCents: 50000 })]);
    const after = buildBuckets([row({ projectId: "proj-A", status: "paid", totalEstimatedCents: 50000 })]);

    expect(before.find((b) => b.key === "approved")!.count).toBe(1);
    expect(before.find((b) => b.key === "paid")!.count).toBe(0);
    expect(after.find((b) => b.key === "paid")!.count).toBe(1);
    expect(after.find((b) => b.key === "approved")!.count).toBe(0);
  });

  it("T-VM1-10-3 [normal] MDL total uses totalMdlCents for foreign currencies", () => {
    const rows = [
      row({ projectId: "proj-A", status: "approved", totalEstimatedCents: 1000, totalMdlCents: 17000, currency: "EUR" }),
      row({ projectId: "proj-A", status: "approved", totalEstimatedCents: 5000, totalMdlCents: null }),
    ];
    const [projA] = buildProjectFolders(rows, [project("proj-A", "ATIC")]);

    expect(projA.totalMdlCents).toBe(22000);
    expect(projA.buckets.find((b) => b.key === "approved")!.totalMdlCents).toBe(22000);
    expect(sumMdlCents(rows)).toBe(22000);
  });

  it("T-VM1-10-4 [normal] projectId=null requests land in 'Fără proiect'", () => {
    const rows = [
      row({ projectId: null, status: "pending_approval", totalEstimatedCents: 3000 }),
      row({ projectId: null, status: "paid", totalEstimatedCents: 7000 }),
      row({ projectId: "proj-A", status: "pending_approval", totalEstimatedCents: 1000 }),
    ];
    const folders = buildProjectFolders(rows, [project("proj-A", "ATIC")]);
    const noProject = folders.find((f) => f.projectId === null)!;

    expect(noProject.projectName).toBe("Fără proiect");
    expect(noProject.count).toBe(2);
    expect(noProject.totalMdlCents).toBe(10000);
    // "Fără proiect" sits last, after the real projects.
    expect(folders[folders.length - 1].projectId).toBeNull();
  });

  it("T-VM1-10b-2 [blocant] every status lands in exactly one bucket — counts add up to the folder total", () => {
    const statuses = [
      "draft",
      "pending_approval",
      "changes_requested",
      "reapproval_required",
      "approved",
      "in_finance",
      "paid",
      "rejected",
      "cancelled",
    ];
    const rows = statuses.map((status) => row({ projectId: "proj-A", status, totalEstimatedCents: 100 }));
    const buckets = buildBuckets(rows);

    // The reported bug: the header said "36 cereri" while the visible folders held 4 — drafts and
    // rejected/cancelled had no folder at all, so entering a project hid most of its requests.
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(rows.length);
    expect(buckets.reduce((s, b) => s + b.totalMdlCents, 0)).toBe(sumMdlCents(rows));
  });

  it("T-VM1-10b-2b [normal] a request whose project is gone still shows up under 'Fără proiect' — and stays there when you enter", () => {
    const rows = [
      row({ id: "orphan", projectId: "deleted-project", status: "paid", totalEstimatedCents: 900 }),
      row({ id: "loose", projectId: null, status: "paid", totalEstimatedCents: 100 }),
    ];
    const projects = [project("proj-A", "ATIC")];
    const folders = buildProjectFolders(rows, projects);

    expect(folders.find((f) => f.projectId === null)!.count).toBe(2);
    expect(folders.reduce((s, f) => s + f.count, 0)).toBe(rows.length);

    // The header count and the folder's contents must agree — otherwise the request is
    // countable but unreachable.
    const inside = scopeRows(rows, { projectId: null }, new Set(projects.map((p) => p.id)));
    expect(inside.map((r) => r.id).sort()).toEqual(["loose", "orphan"]);
  });

  it("[normal] event sub-folders group the project's requests by event", () => {
    const rows = [
      row({ projectId: "proj-A", status: "paid", eventId: "ev-1", totalEstimatedCents: 100 }),
      row({ projectId: "proj-A", status: "pending_approval", eventId: "ev-1", totalEstimatedCents: 200 }),
      row({ projectId: "proj-A", status: "paid", eventId: null, totalEstimatedCents: 400 }),
    ];
    const events = buildEventFolders(rows, [event("ev-1", "proj-A", "Hackathon")]);

    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("Hackathon");
    expect(events[0].count).toBe(2);
    expect(events[0].totalMdlCents).toBe(300);
  });
});

// ─── Drive-style navigation ──────────────────────────────────────────────────

describe("VM1-10b: Foldere PAR — navigare pe niveluri", () => {
  it("T-VM1-10b-1 [blocant] href → location → level round-trips for every level", () => {
    const locations = [
      {},
      { projectId: "proj-A" },
      { projectId: null },
      { projectId: "proj-A", eventId: "ev-1" },
      { projectId: "proj-A", bucket: "paid" as const },
      { projectId: "proj-A", eventId: "ev-1", bucket: "pending" as const, parId: "par-9" },
    ];
    const levels = ["root", "project", "project", "event", "bucket", "par"];

    locations.forEach((loc, i) => {
      const href = buildFolderHref(loc);
      const parsed = parseFolderLocation(href);
      expect(levelOf(parsed), href).toBe(levels[i]);
      expect(parsed.projectId).toBe(loc.projectId);
      expect(buildFolderHref(parsed)).toBe(href);
    });
  });

  it("T-VM1-10b-1b [blocant] the root href carries no query — refresh lands on the projects level", () => {
    expect(buildFolderHref({})).toBe("/business/par/folders");
    expect(levelOf(parseFolderLocation("/business/par/folders"))).toBe("root");
    // "Fără proiect" must survive the round-trip as null, not as the string "none".
    expect(parseFolderLocation("/business/par/folders?p=none").projectId).toBeNull();
  });

  it("T-VM1-10b-1c [blocant] a bucket folder shows only its own requests (not the whole list)", () => {
    const rows = [
      row({ id: "a", projectId: "proj-A", status: "paid", totalEstimatedCents: 100 }),
      row({ id: "b", projectId: "proj-A", status: "pending_approval", totalEstimatedCents: 200 }),
      row({ id: "c", projectId: "proj-B", status: "paid", totalEstimatedCents: 400 }),
      row({ id: "d", projectId: "proj-A", status: "paid", eventId: "ev-1", totalEstimatedCents: 800 }),
    ];

    const paidInA = scopeRows(rows, parseFolderLocation(buildFolderHref({ projectId: "proj-A", bucket: "paid" })));
    expect(paidInA.map((r) => r.id).sort()).toEqual(["a", "d"]);

    const paidInEvent = scopeRows(
      rows,
      parseFolderLocation(buildFolderHref({ projectId: "proj-A", eventId: "ev-1", bucket: "paid" })),
    );
    expect(paidInEvent.map((r) => r.id)).toEqual(["d"]);
  });

  it("T-VM1-10b-3 [normal] breadcrumb + parent walk back up to the root", () => {
    const loc = parseFolderLocation(
      buildFolderHref({ projectId: "proj-A", eventId: "ev-1", bucket: "paid", parId: "par-9" }),
    );
    const crumbs = buildBreadcrumb(loc, { projectName: "ATIC", eventName: "Hackathon", parLabel: "PAR-2026-0001" });

    expect(crumbs.map((c) => c.label)).toEqual([
      "Foldere PAR",
      "ATIC",
      "Hackathon",
      "Plătite",
      "PAR-2026-0001",
    ]);
    expect(crumbs.filter((c) => c.current)).toHaveLength(1);
    expect(crumbs[crumbs.length - 1].current).toBe(true);

    // Walking `parentLocation` repeatedly must terminate at the root.
    let cursor: ReturnType<typeof parentLocation> = loc;
    const visited: string[] = [];
    while (cursor) {
      visited.push(levelOf(cursor));
      cursor = parentLocation(cursor);
    }
    expect(visited).toEqual(["par", "bucket", "event", "project", "root"]);
  });
});
