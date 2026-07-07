/**
 * E2E TaskBoard (TB-001) — live-API invoke, per CLAUDE.md §3.5.1quater:
 * testează ACȚIUNEA (fiecare endpoint invocat cu input realist + assert pe 200 și shape),
 * nu doar că butonul se randează.
 *
 * Fluxul verificat = exact fluxul plan-first cerut de owner:
 *   1. login business (admin@atic.demo.io)
 *   2. creează produs cu startDate (ancora șabloanelor)
 *   3. creează board → vine cu cele 4 liste implicite (Gata = isDoneList)
 *   4. PLAN: POST /bulk cu 5 titluri → toate cu listId=null, dueDate=null
 *   5. PROGRAMEAZĂ: PATCH cu dueDate + assigneeRole → persistă
 *   6. KANBAN: POST /:id/move în „Gata" → status=done + completedAt setat
 *   7. mutare afară din „Gata" → status=in_progress, completedAt null
 *   8. OVERVIEW: contoare corecte per produs (done/todo/unassigned)
 *   9. filtre GET (?status=, ?hasDueDate=) + izolare: alt tenant nu vede boardul
 *  10. UUID-guard: segment non-UUID → 404, nu 500
 *
 * Rulare (cu seed proaspăt):
 *   npm run db:reset && npm run db:seed
 *   PORT=3000 npm run start &        # sau serverul de dev pe 8787
 *   BASE_URL=http://localhost:3000 node scripts/e2e-taskboard.mjs
 */
import { request } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PW = process.env.SMOKE_PASSWORD ?? "demo123456";
const ADMIN = "admin@atic.demo.io"; // tenant business ATIC (appKind business)
const OTHER_TENANT_USER = "admin@demo.vectorlearn.io"; // tenant learn — izolare

let passed = 0;
const failures = [];
let n = 0;
async function T(name, fn) {
  n++;
  const id = String(n).padStart(2, "0");
  try {
    await fn();
    passed++;
    console.log(`✅ ${id} ${name}`);
  } catch (e) {
    failures.push(`${id} ${name} — ${e.message}`);
    console.log(`❌ ${id} ${name} — ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label || "value"}: expected ${expected}, got ${actual}`);
}

async function login(email) {
  const c = await request.newContext({ baseURL: BASE });
  const r = await c.post("/api/auth/login", { data: { email, password: PW } });
  if (r.status() !== 200) throw new Error(`login ${email} failed: ${r.status()}`);
  return c;
}
async function call(ctx, method, path, body) {
  const opts = body !== undefined ? { data: body } : {};
  const r = await ctx[method.toLowerCase()](path, opts);
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* non-JSON */
  }
  return { status: r.status(), json };
}

const iso = (d) => d.toISOString().slice(0, 10);
const inDays = (nDays) => {
  const d = new Date();
  d.setDate(d.getDate() + nDays);
  return iso(d);
};

async function main() {
  const admin = await login(ADMIN);

  let productId, boardId, lists, doneList, backlogList;
  let bulkTasks = [];

  await T("POST /api/board/products creează produs cu startDate", async () => {
    const r = await call(admin, "POST", "/api/board/products", {
      name: `E2E Curs ${Date.now()}`,
      kind: "course",
      startDate: inDays(30),
      endDate: inDays(120),
    });
    eq(r.status, 201, "status");
    assert(r.json.id, "missing id");
    eq(r.json.startDate, inDays(30), "startDate");
    productId = r.json.id;
  });

  await T("POST /api/board/boards creează board cu 4 liste implicite", async () => {
    const r = await call(admin, "POST", "/api/board/boards", {
      name: "E2E Lansare",
      productId,
    });
    eq(r.status, 201, "status");
    boardId = r.json.board.id;
    lists = r.json.lists;
    eq(lists.length, 4, "default lists");
    doneList = lists.find((l) => l.isDoneList);
    backlogList = lists.find((l) => l.name === "Backlog");
    assert(doneList && doneList.name === "Gata", "Gata missing/is not done-list");
    assert(backlogList, "Backlog missing");
  });

  await T("GET /api/board/boards/:id → board + liste + labels", async () => {
    const r = await call(admin, "GET", `/api/board/boards/${boardId}`);
    eq(r.status, 200, "status");
    eq(r.json.board.id, boardId, "board id");
    eq(r.json.lists.length, 4, "lists");
    assert(Array.isArray(r.json.labels), "labels array");
  });

  await T("PLAN: POST /bulk cu 5 titluri → 5 taskuri plan-first (listId/dueDate null)", async () => {
    const titles = ["Landing page", "Campanie ads", "Confirmă traineri", "Kit bun venit", "Feedback inițial"];
    const r = await call(admin, "POST", "/api/board/tasks/bulk", { boardId, titles });
    eq(r.status, 201, "status");
    eq(r.json.created, 5, "created count");
    bulkTasks = r.json.tasks;
    for (const t of bulkTasks) {
      eq(t.listId, null, `task "${t.title}" listId`);
      eq(t.dueDate, null, `task "${t.title}" dueDate`);
      eq(t.status, "todo", `task "${t.title}" status`);
      eq(t.productId, productId, `task "${t.title}" productId denormalizat`);
    }
  });

  await T("PROGRAMEAZĂ: PATCH dueDate + assigneeRole persistă", async () => {
    const t = bulkTasks[0];
    const r = await call(admin, "PATCH", `/api/board/tasks/${t.id}`, {
      dueDate: inDays(14),
      assigneeRole: "marketing",
      listId: backlogList.id,
    });
    eq(r.status, 200, "status");
    eq(r.json.dueDate, inDays(14), "dueDate");
    eq(r.json.assigneeRole, "marketing", "assigneeRole");
    eq(r.json.listId, backlogList.id, "listId");
  });

  await T("PATCH status=done direct din Tabel setează completedAt", async () => {
    const t = bulkTasks[4];
    const r = await call(admin, "PATCH", `/api/board/tasks/${t.id}`, { status: "done" });
    eq(r.status, 200, "status");
    eq(r.json.status, "done", "status");
    assert(r.json.completedAt, "completedAt should be set");
  });

  await T("KANBAN: POST /:id/move în „Gata” → status=done + completedAt", async () => {
    const t = bulkTasks[1];
    const r = await call(admin, "POST", `/api/board/tasks/${t.id}/move`, {
      listId: doneList.id,
      position: 1024,
    });
    eq(r.status, 200, "status");
    eq(r.json.task.listId, doneList.id, "listId");
    eq(r.json.task.status, "done", "status synced to done");
    assert(r.json.task.completedAt, "completedAt set");
  });

  await T("mutare AFARĂ din „Gata” → status=in_progress, completedAt null", async () => {
    const t = bulkTasks[1];
    const r = await call(admin, "POST", `/api/board/tasks/${t.id}/move`, {
      listId: backlogList.id,
      position: 2048,
    });
    eq(r.status, 200, "status");
    eq(r.json.task.status, "in_progress", "status");
    eq(r.json.task.completedAt, null, "completedAt cleared");
  });

  await T("GET ?status=done filtrează corect", async () => {
    const r = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}&status=done`);
    eq(r.status, 200, "status");
    // Doar bulkTasks[4] (PATCH direct) a rămas done — [1] a fost scos din Gata.
    eq(r.json.tasks.length, 1, "done tasks");
    eq(r.json.tasks[0].id, bulkTasks[4].id, "which task");
  });

  await T("GET ?hasDueDate=false → doar taskurile neprogramate", async () => {
    const r = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}&hasDueDate=false`);
    eq(r.status, 200, "status");
    // 5 create − 1 programat cu dueDate = 4 fără termen.
    eq(r.json.tasks.length, 4, "unscheduled tasks");
  });

  await T("OVERVIEW: contoare per produs corecte (done=1, total=5)", async () => {
    const r = await call(admin, "GET", `/api/board/overview?productId=${productId}`);
    eq(r.status, 200, "status");
    const row = r.json.overview.find((o) => o.productId === productId);
    assert(row, "product row missing");
    eq(row.total, 5, "total");
    eq(row.done, 1, "done");
    eq(row.inProgress, 1, "inProgress");
    eq(row.todo, 3, "todo");
    // 3 taskuri fără owner și ne-done: [2],[3] + [1] (in_progress fără rol/owner).
    eq(row.unassigned, 3, "unassigned");
  });

  await T("DELETE /:id arhivează (dispare din listă)", async () => {
    const t = bulkTasks[3];
    const r = await call(admin, "DELETE", `/api/board/tasks/${t.id}`);
    eq(r.status, 200, "status");
    const list = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}`);
    assert(!list.json.tasks.some((x) => x.id === t.id), "archived task still listed");
  });

  await T("IZOLARE: alt tenant nu vede boardul (404) și nu-i vede taskurile", async () => {
    const other = await login(OTHER_TENANT_USER);
    const r = await call(other, "GET", `/api/board/boards/${boardId}`);
    eq(r.status, 404, "cross-tenant board");
    const lt = await call(other, "GET", `/api/board/tasks?boardId=${boardId}`);
    eq(lt.status, 200, "list status");
    eq(lt.json.tasks.length, 0, "cross-tenant tasks leaked");
    await other.dispose();
  });

  await T("UUID-guard: segment non-UUID → 404, nu 500", async () => {
    for (const p of ["/api/board/tasks/not-a-uuid", "/api/board/boards/foo", "/api/board/products/bar"]) {
      const r = await call(admin, "GET", p.includes("tasks") ? p : p);
      assert(r.status === 404, `${p}: expected 404, got ${r.status}`);
    }
    // PATCH cu segment invalid la fel.
    const r = await call(admin, "PATCH", "/api/board/tasks/not-a-uuid", { title: "x" });
    eq(r.status, 404, "PATCH non-uuid");
  });

  await T("anonim: /api/board/* → 401", async () => {
    const anon = await request.newContext({ baseURL: BASE });
    const r = await call(anon, "GET", "/api/board/products");
    eq(r.status, 401, "anon status");
    await anon.dispose();
  });

  await admin.dispose();

  console.log(`\n${passed}/${n} passed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ❌ ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("E2E fatal:", e);
  process.exit(1);
});
