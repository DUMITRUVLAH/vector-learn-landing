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

  let productId, boardId, lists, doneList, backlogList, templateId;
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

  await T("TB-002 reordonare ÎN coloană: poziție fracționată între doi vecini", async () => {
    // Două taskuri în Backlog; al treilea inserat între ele primește media pozițiilor.
    const r1 = await call(admin, "POST", "/api/board/tasks", { boardId, title: "R1", listId: backlogList.id, position: 1000 });
    const r2 = await call(admin, "POST", "/api/board/tasks", { boardId, title: "R2", listId: backlogList.id, position: 2000 });
    const r3 = await call(admin, "POST", "/api/board/tasks", { boardId, title: "R3", listId: backlogList.id, position: 3000 });
    eq(r3.status, 201, "create R3");
    const mv = await call(admin, "POST", `/api/board/tasks/${r3.json.id}/move`, {
      listId: backlogList.id,
      position: (1000 + 2000) / 2,
    });
    eq(mv.status, 200, "move status");
    eq(mv.json.task.position, 1500, "fractional position");
    // Ordinea rezultată: R1(1000) < R3(1500) < R2(2000).
    const list = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}`);
    const inBacklog = list.json.tasks
      .filter((t) => t.listId === backlogList.id && ["R1", "R2", "R3"].includes(t.title))
      .sort((a, b) => a.position - b.position)
      .map((t) => t.title);
    eq(JSON.stringify(inBacklog), JSON.stringify(["R1", "R3", "R2"]), "order after reorder");
    void r1; void r2;
  });

  await T("TB-002 garda de rebalans: gap sub 0.0001 → server renumerotează", async () => {
    // Înjumătățim poziția până sub MIN_GAP față de vecinul de jos → rebalanced:true.
    const tgt = await call(admin, "POST", "/api/board/tasks", { boardId, title: "RB", listId: backlogList.id, position: 4000 });
    let pos = 1000; // sub R1(1000): halving spre 0 → gap față de 0... folosim între R1 și R3.
    let rebalanced = false;
    let lo = 1000, hi = 1500; // între R1 și R3
    for (let i = 0; i < 40 && !rebalanced; i++) {
      pos = (lo + hi) / 2;
      const mv = await call(admin, "POST", `/api/board/tasks/${tgt.json.id}/move`, { listId: backlogList.id, position: pos });
      eq(mv.status, 200, `move #${i}`);
      rebalanced = mv.json.rebalanced === true;
      hi = pos; // strângem spre lo → gap-ul scade exponențial
    }
    assert(rebalanced, "rebalance never triggered after 40 halvings");
    // După rebalans, pozițiile sunt re-spațiate (multipli de 1024) și ordinea e păstrată.
    const list = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}`);
    const positions = list.json.tasks
      .filter((t) => t.listId === backlogList.id)
      .map((t) => t.position)
      .sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) {
      assert(positions[i] - positions[i - 1] >= 1, "positions not re-spaced after rebalance");
    }
  });

  await T("TB-004 șablon: creare cu 3 iteme + GET cu itemCount", async () => {
    const r = await call(admin, "POST", "/api/board/templates", {
      name: `E2E Șablon ${Date.now()}`,
      productKind: "course",
      items: [
        { title: "Anunț public", assigneeRole: "marketing", offsetDays: -30, defaultListName: "Backlog" },
        { title: "Confirmări participanți", assigneeRole: "sales", offsetDays: -7, defaultListName: "backlog" },
        { title: "Feedback final", offsetAnchor: "end", offsetDays: 3, defaultListName: "Gata" },
      ],
    });
    eq(r.status, 201, "create status");
    eq(r.json.items.length, 3, "items");
    templateId = r.json.template.id;
    const list = await call(admin, "GET", "/api/board/templates");
    const row = list.json.templates.find((t) => t.id === templateId);
    eq(row.itemCount, 3, "itemCount");
  });

  await T("TB-004 GENERARE: dueDate = ancora produsului + offset (acțiunea reală)", async () => {
    const r = await call(admin, "POST", `/api/board/templates/${templateId}/generate`, { boardId });
    eq(r.status, 200, "status");
    eq(r.json.createdCount, 3, "created");
    eq(r.json.unscheduledCount, 0, "unscheduled");
    const byTitle = Object.fromEntries(r.json.tasks.map((t) => [t.title, t]));
    // Produsul e2e: start=inDays(30), end=inDays(120).
    eq(byTitle["Anunț public"].dueDate, inDays(30 - 30), "start-30");
    eq(byTitle["Confirmări participanți"].dueDate, inDays(30 - 7), "start-7");
    eq(byTitle["Feedback final"].dueDate, inDays(120 + 3), "end+3");
    // Listele țintă: match case-insensitive („backlog" → Backlog), „Gata" → done list.
    eq(byTitle["Anunț public"].listId, backlogList.id, "listă Backlog");
    eq(byTitle["Confirmări participanți"].listId, backlogList.id, "listă backlog (case-insens)");
    eq(byTitle["Feedback final"].listId, doneList.id, "listă Gata");
    // Proveniența e trasabilă.
    eq(byTitle["Anunț public"].sourceTemplateId, templateId, "sourceTemplateId");
    assert(byTitle["Anunț public"].templateItemId, "templateItemId set");
  });

  await T("TB-004 idempotență: regenerarea sare rândurile deja generate", async () => {
    const r = await call(admin, "POST", `/api/board/templates/${templateId}/generate`, { boardId });
    eq(r.status, 200, "status");
    eq(r.json.createdCount, 0, "created on re-run");
    eq(r.json.skippedCount, 3, "skipped");
    // Forțarea duplicării e explicită.
    const forced = await call(
      admin,
      "POST",
      `/api/board/templates/${templateId}/generate?skipExisting=false`,
      { boardId }
    );
    eq(forced.json.createdCount, 3, "forced duplicates");
  });

  await T("TB-004 CRUD iteme: PATCH offset + DELETE rând", async () => {
    const tpl = await call(admin, "GET", `/api/board/templates/${templateId}`);
    const item = tpl.json.items[0];
    const patched = await call(admin, "PATCH", `/api/board/templates/${templateId}/items/${item.id}`, {
      offsetDays: -45,
    });
    eq(patched.status, 200, "patch status");
    eq(patched.json.offsetDays, -45, "offsetDays");
    const del = await call(admin, "DELETE", `/api/board/templates/${templateId}/items/${item.id}`);
    eq(del.status, 200, "delete status");
    const after = await call(admin, "GET", `/api/board/templates/${templateId}`);
    eq(after.json.items.length, 2, "items after delete");
  });

  await T("TB-005 etichete: create + toggle on/off + labelIds în lista de taskuri", async () => {
    const label = await call(admin, "POST", "/api/board/labels", {
      boardId,
      name: "Prioritar",
      colorToken: "warning",
    });
    eq(label.status, 201, "create label");
    const t = bulkTasks[2];
    const on = await call(admin, "POST", "/api/board/labels/toggle", { taskId: t.id, labelId: label.json.id });
    eq(on.json.attached, true, "attach");
    // Lista de taskuri poartă labelIds (chips pe carduri).
    const list = await call(admin, "GET", `/api/board/tasks?boardId=${boardId}`);
    const withLabel = list.json.tasks.find((x) => x.id === t.id);
    assert(withLabel.labelIds.includes(label.json.id), "labelIds in list");
    // Toggle a doua oară → detașare.
    const off = await call(admin, "POST", "/api/board/labels/toggle", { taskId: t.id, labelId: label.json.id });
    eq(off.json.attached, false, "detach");
  });

  await T("TB-005 checklist: add + done + delete (acțiunea completă)", async () => {
    const t = bulkTasks[2];
    const a = await call(admin, "POST", "/api/board/checklists", { taskId: t.id, text: "Pasul 1" });
    eq(a.status, 201, "add");
    const b = await call(admin, "POST", "/api/board/checklists", { taskId: t.id, text: "Pasul 2" });
    const done = await call(admin, "PATCH", `/api/board/checklists/${a.json.id}`, { done: true });
    eq(done.json.done, true, "done");
    const del = await call(admin, "DELETE", `/api/board/checklists/${b.json.id}`);
    eq(del.status, 200, "delete");
    const detail = await call(admin, "GET", `/api/board/tasks/${t.id}`);
    eq(detail.json.checklist.length, 1, "checklist in detail");
    eq(detail.json.checklist[0].done, true, "state persisted");
  });

  await T("TB-005 comentarii: add cu autor din sesiune; alt autor nu poate șterge", async () => {
    const t = bulkTasks[2];
    const cm = await call(admin, "POST", "/api/board/comments", { taskId: t.id, body: "Notă de la admin" });
    eq(cm.status, 201, "add");
    assert(cm.json.authorName, "authorName");
    // Alt user al ACELUIAȘI tenant (approver) nu poate șterge comentariul altcuiva.
    const approver = await login("approver@atic.demo.io");
    const stranger = await call(approver, "DELETE", `/api/board/comments/${cm.json.id}`);
    eq(stranger.status, 404, "non-author delete blocked");
    await approver.dispose();
    // Autorul poate.
    const own = await call(admin, "DELETE", `/api/board/comments/${cm.json.id}`);
    eq(own.status, 200, "author delete");
  });

  await T("TB-005 atașamente: add metadata (URL valid) + reject URL invalid + delete", async () => {
    const t = bulkTasks[2];
    const bad = await call(admin, "POST", "/api/board/attachments", {
      taskId: t.id,
      filename: "Brief.pdf",
      url: "not-a-url",
    });
    eq(bad.status, 400, "invalid url rejected");
    const a = await call(admin, "POST", "/api/board/attachments", {
      taskId: t.id,
      filename: "Brief.pdf",
      url: "https://example.com/brief.pdf",
      sizeBytes: 12345,
    });
    eq(a.status, 201, "add");
    const detail = await call(admin, "GET", `/api/board/tasks/${t.id}`);
    eq(detail.json.attachments.length, 1, "in detail");
    const del = await call(admin, "DELETE", `/api/board/attachments/${a.json.id}`);
    eq(del.status, 200, "delete");
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
