/**
 * @vitest-environment node
 * TASKS-001: managerul de task-uri — INTEGRATION (rutele reale, PGlite, toate migrările).
 *
 * Fiecare test EXECUTĂ acțiunea (creează, mută, aprobă, șterge…) și verifică efectul, nu doar
 * că ruta răspunde (CLAUDE.md §3.5.1quater). Regulile vin din forma finală a sursei (HR365,
 * `hr_task_board_access` / `hr_task_can_see` / garda de câmpuri / garda de completare), plus
 * echipele: un board „de echipă" e deschis membrilor echipei lui.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { inAppNotifications, tenants, users } from "../db/schema";
import { boardTasks, taskActivity } from "../db/schema/tasks";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string; name: string; isActive: boolean };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantId: string;
let otherTenantId: string;
const people: Record<string, { id: string; role: string; tenantId: string; name: string }> = {};

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

function as(key: string) {
  const p = people[key];
  session = { id: p.id, tenantId: p.tenantId, role: p.role, email: `${key}@t.md`, name: p.name, isActive: true };
}

async function call<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await app.request(`/api/tasks${url}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as T };
}

interface BoardJson {
  id: string;
  name: string;
  can_edit: boolean;
  can_delete: boolean;
  my_role: string | null;
  starred_by: string[];
  visibility: string;
}
interface ListJson {
  id: string;
  name: string;
  is_done_list: boolean;
  maps_to_status: string | null;
}
interface TaskJson {
  id: string;
  title: string;
  status: string;
  list_id: string | null;
  board_id: string | null;
  assignees: string[];
  completed_at: string | null;
  approved_by: string | null;
  deleted_at: string | null;
  is_recurring: boolean;
  due_date: string | null;
  parent_task_id: string | null;
}

async function createBoard(name: string, extra: Record<string, unknown> = {}): Promise<BoardJson> {
  const res = await call<{ board: BoardJson }>("POST", "/boards", { name, ...extra });
  expect(res.status).toBe(201);
  return res.json.board;
}

async function listsOf(boardId: string): Promise<ListJson[]> {
  const res = await call<{ lists: ListJson[] }>("GET", `/boards/${boardId}/lists`);
  expect(res.status).toBe(200);
  return res.json.lists;
}

async function createTask(body: Record<string, unknown>): Promise<TaskJson> {
  const res = await call<{ task: TaskJson }>("POST", "/tasks", body);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json.task;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { tasksRoutes } = await import("../routes/tasks");
  app = new Hono();
  app.route("/api/tasks", tasksRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-tasks" }).returning();
  const [other] = await testDb.insert(tenants).values({ name: "Altul", slug: "altul-tasks" }).returning();
  tenantId = tenant.id;
  otherTenantId = other.id;

  const mk = async (key: string, name: string, role: string, tenant = tenantId) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId: tenant, email: `${key}@t.md`, passwordHash: "x", name, role: role as typeof users.$inferInsert.role })
      .returning();
    people[key] = { id: u.id, role, tenantId: tenant, name };
  };
  await mk("admin", "Ana Admin", "admin");
  await mk("ion", "Ion Popescu", "teacher");
  await mk("maria", "Maria Rusu", "teacher");
  await mk("vlad", "Vlad Manager", "manager");
  await mk("strain", "Străin din afara echipei", "teacher");
  await mk("intrus", "Intrus", "admin", otherTenantId);
});

describe("boarduri", () => {
  it("creatorul devine admin, iar boardul se naște cu 4 coloane și o singură coloană de finalizare", async () => {
    as("ion");
    const board = await createBoard("Marketing");
    expect(board.my_role).toBe("admin");
    expect(board.can_delete).toBe(true);
    const lists = await listsOf(board.id);
    expect(lists.map((l) => l.maps_to_status)).toEqual(["todo", "in_progress", "pending", "done"]);
    expect(lists.filter((l) => l.is_done_list)).toHaveLength(1);
  });

  it("un board privat nu există pentru cine nu e membru; administratorul workspace-ului îl vede", async () => {
    as("ion");
    const board = await createBoard("Privat Ion");
    as("maria");
    expect((await call("GET", `/boards/${board.id}/lists`)).status).toBe(404);
    const maria = await call<{ boards: BoardJson[] }>("GET", "/boards?archived=all");
    expect(maria.json.boards.some((b) => b.id === board.id)).toBe(false);
    as("admin");
    const admin = await call<{ boards: BoardJson[] }>("GET", "/boards?archived=all");
    expect(admin.json.boards.find((b) => b.id === board.id)?.my_role).toBe("admin");
  });

  it("steaua e a mea: altcineva nu vede cine a fixat boardul", async () => {
    as("ion");
    const board = await createBoard("Cu stea", { visibility: "company" });
    expect((await call("POST", `/boards/${board.id}/star`)).status).toBe(200);
    const mine = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(mine.json.boards.find((b) => b.id === board.id)?.starred_by).toEqual([people.ion.id]);
    as("maria");
    const theirs = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(theirs.json.boards.find((b) => b.id === board.id)?.starred_by).toEqual([]);
  });

  it("un workspace străin nu vede nimic, nici după id", async () => {
    as("ion");
    const board = await createBoard("Intern");
    as("intrus");
    expect((await call("GET", `/boards/${board.id}/lists`)).status).toBe(404);
    expect((await call("DELETE", `/boards/${board.id}`)).status).toBe(404);
  });

  it("ștergerea boardului ia task-urile cu el; un editor nu poate șterge", async () => {
    as("ion");
    const board = await createBoard("De șters");
    await createTask({ title: "T1", board_id: board.id });
    await createTask({ title: "T2", board_id: board.id });
    await call("PUT", `/boards/${board.id}/members/${people.maria.id}`, { role: "editor" });
    as("maria");
    expect((await call("DELETE", `/boards/${board.id}`)).status).toBe(403);
    as("ion");
    expect((await call<{ count: number }>("GET", `/boards/${board.id}/task-count`)).json.count).toBe(2);
    const del = await call<{ deleted: number }>("DELETE", `/boards/${board.id}`);
    expect(del.json.deleted).toBe(2);
    const left = await testDb.select().from(boardTasks).where(eq(boardTasks.boardId, board.id));
    expect(left).toHaveLength(0);
  });
});

describe("echipe și vizibilitatea boardului", () => {
  let teamId: string;

  it("doar administratorul creează echipe; echipa apare cu numărul de membri", async () => {
    as("ion");
    expect((await call("POST", "/teams", { name: "Vânzări" })).status).toBe(403);
    as("admin");
    const created = await call<{ team: { id: string; members: { user_id: string }[] } }>("POST", "/teams", {
      name: "Vânzări",
      user_ids: [people.ion.id, people.maria.id],
    });
    expect(created.status).toBe(201);
    teamId = created.json.team.id;
    expect(created.json.team.members).toHaveLength(2);
    expect((await call("POST", "/teams", { name: "Vânzări" })).status).toBe(409);
    as("ion");
    const selectable = await call<{ teams: { team_id: string; member_count: number }[] }>("GET", "/teams/selectable");
    expect(selectable.json.teams.find((t) => t.team_id === teamId)?.member_count).toBe(2);
  });

  it("un board de echipă e deschis membrilor echipei ca editori — și închis celorlalți", async () => {
    as("ion");
    const board = await createBoard("Pipeline echipă", { visibility: "team", team_id: teamId });
    const task = await createTask({ title: "Sună clientul", board_id: board.id });
    as("maria");
    const boards = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(boards.json.boards.find((b) => b.id === board.id)?.my_role).toBe("editor");
    expect((await call("GET", `/tasks/${task.id}`)).status).toBe(200);
    as("strain");
    expect((await call("GET", `/tasks/${task.id}`)).status).toBe(404);
  });

  it("scoaterea din echipă taie accesul; membrul nominal își păstrează rolul explicit", async () => {
    as("ion");
    const board = await createBoard("Echipă 2", { visibility: "team", team_id: teamId });
    await call("PUT", `/boards/${board.id}/members/${people.maria.id}`, { role: "viewer" });
    as("maria");
    const before = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(before.json.boards.find((b) => b.id === board.id)?.my_role).toBe("viewer");
    as("admin");
    expect((await call("DELETE", `/teams/${teamId}/members/${people.ion.id}`)).status).toBe(200);
    // Ion rămâne admin nominal pe boardul lui, chiar în afara echipei.
    as("ion");
    const ion = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(ion.json.boards.find((b) => b.id === board.id)?.my_role).toBe("admin");
  });

  it("un board de echipă cere o echipă existentă", async () => {
    as("ion");
    expect((await call("POST", "/boards", { name: "Fără echipă", visibility: "team" })).status).toBe(400);
  });

  it("un board al organizației e deschis tuturor", async () => {
    as("ion");
    const board = await createBoard("Anunțuri", { visibility: "company" });
    as("strain");
    const boards = await call<{ boards: BoardJson[] }>("GET", "/boards");
    expect(boards.json.boards.find((b) => b.id === board.id)?.my_role).toBe("editor");
  });

  it("adaugă o echipă întreagă ca membri ai boardului", async () => {
    as("admin");
    const team = await call<{ team: { id: string } }>("POST", "/teams", { name: "Contabilitate", user_ids: [people.maria.id, people.strain.id] });
    as("ion");
    const board = await createBoard("Închidere de lună");
    const res = await call<{ added: number }>("POST", `/boards/${board.id}/members/team`, { team_id: team.json.team.id, role: "editor" });
    expect(res.json.added).toBe(2);
    as("strain");
    expect((await call<{ boards: BoardJson[] }>("GET", "/boards")).json.boards.some((b) => b.id === board.id)).toBe(true);
  });
});

describe("task-uri: vizibilitate", () => {
  it("un task privat îl vede doar creatorul — nici administratorul, nici responsabilul", async () => {
    as("ion");
    const board = await createBoard("Cu secrete", { visibility: "company" });
    const secret = await createTask({ title: "Secret", board_id: board.id, is_private: true, assignees: [people.maria.id] });
    as("admin");
    expect((await call("GET", `/tasks/${secret.id}`)).status).toBe(404);
    as("maria");
    expect((await call("GET", `/tasks/${secret.id}`)).status).toBe(404);
    as("ion");
    expect((await call("GET", `/tasks/${secret.id}`)).status).toBe(200);
  });

  it("un task personal (fără board) îl văd creatorul și responsabilul", async () => {
    as("ion");
    const personal = await createTask({ title: "Personal", assignees: [people.maria.id] });
    expect(personal.board_id).toBeNull();
    as("maria");
    expect((await call("GET", `/tasks/${personal.id}`)).status).toBe(200);
    as("strain");
    expect((await call("GET", `/tasks/${personal.id}`)).status).toBe(404);
  });

  it("un membru viewer vede boardul, dar nu task-urile altora de pe el", async () => {
    as("ion");
    const board = await createBoard("Viewer");
    const task = await createTask({ title: "Al lui Ion", board_id: board.id });
    await call("PUT", `/boards/${board.id}/members/${people.strain.id}`, { role: "viewer" });
    as("strain");
    expect((await call("GET", `/boards/${board.id}/lists`)).status).toBe(200);
    const tasks = await call<{ tasks: TaskJson[] }>("GET", `/boards/${board.id}/tasks`);
    expect(tasks.json.tasks.some((t) => t.id === task.id)).toBe(false);
    expect((await call("POST", "/tasks", { title: "Nu am voie", board_id: board.id })).status).toBe(403);
  });

  it("managerul vede implicit task-urile coechipierilor; o regulă pentru toți deschide organizația", async () => {
    as("admin");
    await call("POST", "/teams", { name: "Echipa lui Vlad", user_ids: [people.vlad.id, people.strain.id] });
    as("maria");
    const mariaTask = await createTask({ title: "Al Mariei", assignees: [people.maria.id] });
    as("strain");
    const strainTask = await createTask({ title: "Al lui Străin", assignees: [people.strain.id] });
    as("vlad");
    expect((await call("GET", `/tasks/${strainTask.id}`)).status).toBe(200);
    expect((await call("GET", `/tasks/${mariaTask.id}`)).status).toBe(404);
    as("admin");
    expect((await call("PUT", "/visibility-rules", { subject_type: "managers", scope: "company" })).status).toBe(200);
    as("vlad");
    expect((await call("GET", `/tasks/${mariaTask.id}`)).status).toBe(200);
    // Excepția pe persoană bate regula de grup.
    as("admin");
    await call("PUT", "/visibility-rules", { subject_type: "user", subject_user_id: people.vlad.id, scope: "own" });
    as("vlad");
    expect((await call("GET", `/tasks/${strainTask.id}`)).status).toBe(404);
    as("ion");
    expect((await call("GET", "/visibility-rules")).status).toBe(403);
  });
});

describe("task-uri: scriere", () => {
  it("statusul și coloana spun același lucru, în ambele direcții", async () => {
    as("ion");
    const board = await createBoard("Sincron");
    const lists = await listsOf(board.id);
    const task = await createTask({ title: "Sincron", board_id: board.id, list_id: lists[0].id });
    const done = await call<{ task: TaskJson }>("PATCH", `/tasks/${task.id}`, { status: "done" });
    expect(done.json.task.list_id).toBe(lists[3].id);
    expect(done.json.task.completed_at).not.toBeNull();
    const moved = await call<{ task: TaskJson }>("POST", `/tasks/${task.id}/move`, { list_id: lists[1].id, position: 10 });
    expect(moved.json.task.status).toBe("in_progress");
    expect(moved.json.task.completed_at).toBeNull();
  });

  it("responsabilul mută progresul, dar nu rescrie titlul", async () => {
    as("ion");
    const board = await createBoard("Gardă");
    const task = await createTask({ title: "Original", board_id: board.id, assignees: [people.strain.id] });
    as("strain");
    expect((await call("PATCH", `/tasks/${task.id}`, { status: "in_progress" })).status).toBe(200);
    const denied = await call<{ error: string }>("PATCH", `/tasks/${task.id}`, { title: "Rescris" });
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe("forbidden");
  });

  it("închiderea unui task cu aprobator cere aprobarea lui", async () => {
    as("ion");
    const board = await createBoard("Aprobări");
    const task = await createTask({ title: "Contract", board_id: board.id, assignees: [people.strain.id], approver_ids: [people.maria.id] });
    as("strain");
    const blocked = await call<{ error: string }>("PATCH", `/tasks/${task.id}`, { status: "done" });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toBe("needs_approval");
    as("maria");
    expect((await call<{ count: number }>("GET", "/approvals/count")).json.count).toBeGreaterThanOrEqual(1);
    const approved = await call<{ task: TaskJson }>("POST", `/tasks/${task.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.json.task.status).toBe("done");
    expect(approved.json.task.approved_by).toBe(people.maria.id);
    // Aprobatorii nu se schimbă pe un task închis.
    as("ion");
    expect((await call<{ error: string }>("PATCH", `/tasks/${task.id}`, { approver_ids: [] })).json.error).toBe("reopen_first");
  });

  it("respingerea trimite task-ul înapoi în lucru, cu motivul ca comentariu", async () => {
    as("ion");
    const task = await createTask({ title: "De respins", approver_ids: [people.maria.id], assignees: [people.maria.id] });
    as("maria");
    const res = await call<{ task: TaskJson }>("POST", `/tasks/${task.id}/reject`, { reason: "Lipsește anexa" });
    expect(res.json.task.status).toBe("in_progress");
    const comments = await call<{ comments: { content: string }[] }>("GET", `/tasks/${task.id}/comments`);
    expect(comments.json.comments.map((c) => c.content)).toContain("Lipsește anexa");
  });

  it("dependențele blochează închiderea; o dependență circulară e refuzată", async () => {
    as("ion");
    const a = await createTask({ title: "Brief" });
    const b = await createTask({ title: "Texte" });
    expect((await call("POST", "/dependencies", { task_id: b.id, depends_on_task_id: a.id })).status).toBe(201);
    const blocked = await call<{ error: string; detail: string }>("PATCH", `/tasks/${b.id}`, { status: "done" });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toBe("blocked_by_dependency");
    expect(blocked.json.detail).toContain("Brief");
    expect((await call<{ error: string }>("POST", "/dependencies", { task_id: a.id, depends_on_task_id: b.id })).json.error).toBe("cycle");
    await call("PATCH", `/tasks/${a.id}`, { status: "done" });
    expect((await call("PATCH", `/tasks/${b.id}`, { status: "done" })).status).toBe(200);
  });

  it("ștergerea ia subtaskurile cu ea, iar restaurarea le aduce înapoi împreună", async () => {
    as("ion");
    const board = await createBoard("Cascadă");
    const parent = await createTask({ title: "Părinte", board_id: board.id });
    const child = await createTask({ title: "Copil", board_id: board.id, parent_task_id: parent.id });
    expect((await call("DELETE", `/tasks/${parent.id}`)).status).toBe(200);
    expect((await call("GET", `/tasks/${child.id}`)).status).toBe(404);
    const restored = await call<{ restored: number }>("POST", `/tasks/${parent.id}/restore`);
    expect(restored.json.restored).toBe(2);
    expect((await call("GET", `/tasks/${child.id}`)).status).toBe(200);
    const log = await testDb.select().from(taskActivity).where(and(eq(taskActivity.taskId, child.id), eq(taskActivity.action, "deleted")));
    expect(log).toHaveLength(1);
  });

  it("responsabilul unui subtask îl poate șterge; pe task-ul principal, nu", async () => {
    as("ion");
    const board = await createBoard("Subtask");
    const parent = await createTask({ title: "Principal", board_id: board.id, assignees: [people.strain.id] });
    const child = await createTask({ title: "Sub", board_id: board.id, parent_task_id: parent.id, assignees: [people.strain.id] });
    as("strain");
    expect((await call("DELETE", `/tasks/${parent.id}`)).status).toBe(403);
    expect((await call("DELETE", `/tasks/${child.id}`)).status).toBe(200);
  });

  it("mutarea pe alt board ia subtaskurile cu ea și aterizează neîncadrat", async () => {
    as("ion");
    const from = await createBoard("De unde");
    const to = await createBoard("Unde");
    const lists = await listsOf(from.id);
    const parent = await createTask({ title: "Călător", board_id: from.id, list_id: lists[0].id });
    const child = await createTask({ title: "Bagaj", board_id: from.id, parent_task_id: parent.id });
    expect((await call("POST", `/tasks/${parent.id}/move-board`, { board_id: to.id })).status).toBe(200);
    const moved = await call<{ task: TaskJson }>("GET", `/tasks/${parent.id}`);
    expect(moved.json.task.board_id).toBe(to.id);
    expect(moved.json.task.list_id).toBeNull();
    expect((await call<{ task: TaskJson }>("GET", `/tasks/${child.id}`)).json.task.board_id).toBe(to.id);
  });

  it("o serie recurentă închisă naște următoarea ocurență și îi predă seria", async () => {
    as("ion");
    const series = await createTask({
      title: "Raport săptămânal",
      due_date: "2026-01-05T09:00:00.000Z",
      is_recurring: true,
      recurrence_rule: JSON.stringify({ frequency: "weekly", interval: 1, days: ["mon"], ends_at: null }),
      assignees: [people.ion.id],
    });
    const closed = await call<{ task: TaskJson }>("PATCH", `/tasks/${series.id}`, { status: "done" });
    expect(closed.json.task.is_recurring).toBe(false);
    const next = await testDb
      .select()
      .from(boardTasks)
      .where(and(eq(boardTasks.title, "Raport săptămânal"), eq(boardTasks.isRecurring, true)));
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("todo");
    expect(next[0].dueDate!.getTime()).toBeGreaterThan(Date.now());
    expect(next[0].dueDate!.getUTCDay()).toBe(1);
  });

  it("materializarea unei zile viitoare e idempotentă; trecutul e refuzat", async () => {
    as("ion");
    const series = await createTask({
      title: "Zilnic",
      due_date: new Date(Date.now() + 86_400_000).toISOString(),
      is_recurring: true,
      recurrence_rule: JSON.stringify({ frequency: "daily", interval: 1, days: [], ends_at: null }),
    });
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const first = await call<{ id: string }>("POST", `/tasks/${series.id}/occurrences`, { date: day });
    const second = await call<{ id: string }>("POST", `/tasks/${series.id}/occurrences`, { date: day });
    expect(first.json.id).toBe(second.json.id);
    expect((await call("POST", `/tasks/${series.id}/occurrences`, { date: "2020-01-01" })).status).toBe(400);
  });

  it("„Ia în lucru” pe un task liber îl face al meu, în lucru", async () => {
    as("ion");
    const board = await createBoard("Coadă", { visibility: "company" });
    const free = await createTask({ title: "Liber", board_id: board.id });
    as("maria");
    const available = await call<{ tasks: TaskJson[] }>("GET", "/tasks?scope=available");
    expect(available.json.tasks.some((t) => t.id === free.id)).toBe(true);
    const claimed = await call<{ task: TaskJson }>("POST", `/tasks/${free.id}/claim`);
    expect(claimed.json.task.assignees).toEqual([people.maria.id]);
    expect(claimed.json.task.status).toBe("in_progress");
    expect((await call<{ tasks: TaskJson[] }>("GET", "/tasks?scope=mine")).json.tasks.some((t) => t.id === free.id)).toBe(true);
  });
});

describe("notificări, comentarii, căutare", () => {
  it("atribuirea și mențiunea ajung în clopoțel — dar nu la cel care a făcut acțiunea", async () => {
    as("ion");
    const task = await createTask({ title: "Ofertă Moldcell", assignees: [people.maria.id, people.ion.id] });
    const assigned = await testDb
      .select()
      .from(inAppNotifications)
      .where(and(eq(inAppNotifications.kind, "task_assigned"), eq(inAppNotifications.recipientUserId, people.maria.id)));
    expect(assigned.some((n) => n.payload.task_id === task.id)).toBe(true);
    const selfNotified = await testDb
      .select()
      .from(inAppNotifications)
      .where(and(eq(inAppNotifications.kind, "task_assigned"), eq(inAppNotifications.recipientUserId, people.ion.id)));
    expect(selfNotified.some((n) => n.payload.task_id === task.id)).toBe(false);

    as("maria");
    const comment = await call("POST", `/tasks/${task.id}/comments`, { content: `Gata draftul, @[${people.ion.id}] verifică te rog` });
    expect(comment.status).toBe(201);
    const mention = await testDb
      .select()
      .from(inAppNotifications)
      .where(and(eq(inAppNotifications.kind, "task_mention"), eq(inAppNotifications.recipientUserId, people.ion.id)));
    const note = mention.find((n) => n.payload.task_id === task.id);
    expect(note?.payload.body).toContain("@Ion Popescu");
  });

  it("nu poți menționa pe cineva din alt workspace", async () => {
    as("ion");
    const task = await createTask({ title: "Mențiune greșită" });
    const res = await call("POST", `/tasks/${task.id}/comments`, { content: `salut @[${people.intrus.id}]` });
    expect(res.status).toBe(403);
  });

  it("căutarea găsește doar ce pot vedea", async () => {
    as("ion");
    await createTask({ title: "Factura zebra", is_private: true });
    as("maria");
    const found = await call<{ tasks: TaskJson[] }>("GET", "/search?q=zebra");
    expect(found.json.tasks).toHaveLength(0);
    as("ion");
    expect((await call<{ tasks: TaskJson[] }>("GET", "/search?q=zebra")).json.tasks).toHaveLength(1);
  });

  it("/me spune cine sunt și ce drepturi am", async () => {
    as("vlad");
    const me = await call<{ me: { is_manager: boolean; is_admin: boolean; full_name: string } }>("GET", "/me");
    expect(me.json.me).toMatchObject({ is_manager: true, is_admin: false, full_name: "Vlad Manager" });
  });

  it("id-urile care nu sunt UUID dau 404, nu 500", async () => {
    as("ion");
    expect((await call("GET", "/tasks/nu-e-uuid")).status).toBe(404);
    expect((await call("GET", "/boards/par-prefill-123/lists")).status).toBe(404);
  });
});
