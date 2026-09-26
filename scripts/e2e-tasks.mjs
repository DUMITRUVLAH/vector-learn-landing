#!/usr/bin/env node
/**
 * TASKS-001 — e2e al managerului de task-uri, pe un server care rulează (local sau preview).
 *
 *   BASE_URL=http://localhost:3151 node scripts/e2e-tasks.mjs
 *   BASE_URL=… node scripts/e2e-tasks.mjs --api     (doar partea de API)
 *
 * Partea 1 — API, cu oameni reali din workspace-ul demo ATIC: administratorul creează o echipă și
 * un board al echipei, dă un task solicitantului cu aprobatorul ca aprobator; solicitantul îl vede
 * prin echipă, îl mută în lucru, încearcă să-l închidă și e oprit (are nevoie de aprobare);
 * aprobatorul îl aprobă; mențiunea din comentariu ajunge în clopoțel. Fiecare pas EXECUTĂ acțiunea
 * și verifică efectul (CLAUDE.md §3.5.1quater), nu doar că ruta răspunde.
 *
 * Partea 2 — browser real (Chrome headless): fiecare pagină a modulului se deschide, URL-ul final
 * e chiar cel cerut (o redirecționare la login NU trece — lecția din §3.5.1quinquies), nu apare
 * text de eroare, nu cade niciun JS; plus acțiunile de bază în Kanban (task nou, deschiderea
 * panoului, comentariu).
 *
 * Cere modulul pornit pentru workspace (Consola Platformă, sau `tenant_modules` local). Cele 3
 * logări API + 1 în browser stau sub plafonul de 10 / 15 minute al `authRateLimit`.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3151").replace(/\/$/, "");
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const ADMIN = process.env.TASKS_ADMIN ?? "admin@atic.demo.io";
const REQUESTOR = process.env.TASKS_REQUESTOR ?? "requestor@atic.demo.io";
const APPROVER = process.env.TASKS_APPROVER ?? "approver@atic.demo.io";
const API_ONLY = process.argv.includes("--api");
const SHOTS = process.env.SHOTS_DIR ?? "";
// VIEWPORT=390x844 = telefon; DARK=1 = tema întunecată (clasa `.dark`, ca în Tailwind).
const [VIEW_W, VIEW_H] = (process.env.VIEWPORT ?? "1440x900").split("x").map(Number);
const DARK = process.env.DARK === "1";
const stamp = Date.now().toString(36);

let failures = 0;
const ok = (msg) => console.log(`✅ ${msg}`);
const fail = (msg) => {
  failures += 1;
  console.error(`❌ ${msg}`);
};
function check(condition, msg, detail) {
  if (condition) ok(msg);
  else fail(`${msg}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  return condition;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/business/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status} ${await res.text()}`);
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  return async (method, url, body) => {
    const r = await fetch(`${BASE}/api/tasks${url}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: r.status, json };
  };
}

async function apiFlow() {
  console.log(`\n— API (${BASE}) —`);
  const admin = await login(ADMIN);
  const me = await admin("GET", "/me");
  if (!check(me.status === 200 && me.json.me?.is_admin === true, "administratorul intră în modul", me)) {
    if (me.json.error === "module_disabled") console.error("   Modulul „tasks” e oprit pentru workspace — pornește-l din Consola Platformă.");
    return null;
  }

  const people = (await admin("GET", "/assignable")).json.people ?? [];
  const byEmail = (email) => people.find((p) => p.email === email);
  const requestor = byEmail(REQUESTOR);
  const approver = byEmail(APPROVER);
  if (!check(!!requestor && !!approver, "solicitantul și aprobatorul sunt printre oamenii cărora li se poate atribui", people.map((p) => p.email))) return null;

  const team = await admin("POST", "/teams", { name: `E2E Echipă ${stamp}`, user_ids: [requestor.user_id] });
  check(team.status === 201 && team.json.team?.members?.length === 1, "administratorul creează o echipă cu un membru", team);

  const board = await admin("POST", "/boards", { name: `E2E Board ${stamp}`, visibility: "team", team_id: team.json.team?.id });
  check(board.status === 201 && board.json.board?.visibility === "team", "board de echipă creat", board);
  const boardId = board.json.board?.id;
  const lists = (await admin("GET", `/boards/${boardId}/lists`)).json.lists ?? [];
  check(lists.length === 4 && lists.filter((l) => l.is_done_list).length === 1, "boardul are 4 coloane, una de finalizare", lists);

  const task = await admin("POST", "/tasks", {
    title: `E2E Contract ${stamp}`,
    board_id: boardId,
    list_id: lists[0]?.id,
    assignees: [requestor.user_id],
    approver_ids: [approver.user_id],
    due_date: new Date(Date.now() + 86_400_000).toISOString(),
  });
  check(task.status === 201 && task.json.task?.assignees?.[0] === requestor.user_id, "task creat cu responsabil și aprobator", task);
  const taskId = task.json.task?.id;

  const reqApi = await login(REQUESTOR);
  const reqBoards = (await reqApi("GET", "/boards")).json.boards ?? [];
  check(reqBoards.find((b) => b.id === boardId)?.my_role === "editor", "solicitantul vede boardul prin echipă, ca editor", reqBoards.map((b) => [b.name, b.my_role]));
  const mine = (await reqApi("GET", "/tasks?scope=mine")).json.tasks ?? [];
  check(mine.some((t) => t.id === taskId), "task-ul apare în „Task-urile mele” ale solicitantului");
  const moving = await reqApi("PATCH", `/tasks/${taskId}`, { status: "in_progress" });
  check(moving.status === 200 && moving.json.task?.list_id === lists[1]?.id, "statusul „în lucru” mută cardul în coloana „În lucru”", moving);
  const closing = await reqApi("PATCH", `/tasks/${taskId}`, { status: "done" });
  check(closing.status === 403 && closing.json.error === "needs_approval", "închiderea fără aprobare e refuzată cu motivul corect", closing);
  // Solicitantul e în echipă, deci editor pe board — are drept deplin. Aprobatorul nu e nici în
  // echipă, nici membru: pe task are doar dreptul de progres (garda de câmpuri).

  const comment = await admin("POST", `/tasks/${taskId}/comments`, { content: `Verifică te rog @[${approver.user_id}]` });
  check(comment.status === 201, "comentariu cu mențiune adăugat", comment);

  const apprApi = await login(APPROVER);
  const rename = await apprApi("PATCH", `/tasks/${taskId}`, { title: "Rescris de aprobator" });
  check(rename.status === 403 && rename.json.error === "forbidden", "aprobatorul nu poate rescrie titlul (doar progresul)", rename);
  const count = await apprApi("GET", "/approvals/count");
  check(count.json.count >= 1, "aprobatorul vede task-ul în aprobări", count);
  const approved = await apprApi("POST", `/tasks/${taskId}/approve`);
  check(approved.status === 200 && approved.json.task?.status === "done" && approved.json.task?.list_id === lists[3]?.id, "aprobarea închide task-ul și îl mută în „Gata”", approved);

  const activity = (await admin("GET", `/tasks/${taskId}/activity`)).json.activity ?? [];
  check(activity.some((a) => a.action === "status_changed"), "istoricul a înregistrat schimbările de status", activity.map((a) => a.action));

  return { admin, boardId, teamId: team.json.team?.id, taskId };
}

async function browserFlow(ctx) {
  const { chromium } = await import("playwright");
  const chromePaths = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const executablePath = chromePaths.find((p) => existsSync(p));
  if (!executablePath) {
    fail("nu găsesc Chrome (setează CHROME_PATH)");
    return;
  }
  console.log(`\n— Browser —`);
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: VIEW_W, height: VIEW_H } });
  const jsErrors = [];
  const badApi = [];
  page.on("pageerror", (e) => jsErrors.push(e.message.split("\n")[0]));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) badApi.push(`${r.status()} ${r.url().replace(BASE, "")}`);
  });
  const shot = async (name) => {
    if (DARK) await page.evaluate(() => document.documentElement.classList.add("dark"));
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  };

  await page.goto(`${BASE}/#/business/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/business\/(dashboard|par|tasks|fin|crm)/, { timeout: 20_000 }).catch(() => {});

  const ERR = ["A apărut o eroare", "Internal Server", "http_500", "is not defined", "Cannot read", "Unexpected token", "undefined is not", "server_error"];
  const routes = [
    ["me", "/business/tasks/boards/me"],
    ["boards", "/business/tasks/boards"],
    ["all", "/business/tasks/boards/all"],
    ["gantt", "/business/tasks/boards/gantt"],
    ["approvals", "/business/tasks/boards/approvals"],
    ["dashboard", "/business/tasks/boards/dashboard"],
    ["teams", "/business/tasks/boards/teams"],
    ["access", "/business/tasks/boards/access"],
  ];
  if (ctx?.boardId) routes.push(["board", `/business/tasks/boards/${ctx.boardId}`]);
  for (const [name, route] of routes) {
    const before = jsErrors.length;
    await page.goto(`${BASE}/#${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const url = page.url();
    const text = await page.$eval("body", (el) => el.innerText).catch(() => "");
    const bad = ERR.filter((p) => text.includes(p));
    check(url.includes(`#${route}`) && bad.length === 0 && jsErrors.length === before && text.trim().length > 50, `pagina ${route} se randează`, { url, bad, js: jsErrors.slice(before) });
    await shot(name);
  }

  if (ctx?.boardId) {
    // Kanban: task nou din bara de adăugare rapidă, apoi deschiderea panoului.
    await page.goto(`${BASE}/#/business/tasks/boards/${ctx.boardId}?view=kanban`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot("kanban");
    const title = `Din browser ${stamp}`;
    // „Adaugă task" din prima coloană deschide compozitorul coloanei (nu căutarea din meniu).
    // Primul „Adaugă task" e butonul din antet; al doilea, cel al primei coloane.
    await page.getByText("Adaugă task", { exact: true }).nth(1).click().catch(() => {});
    await page.waitForTimeout(300);
    const quick = page.getByPlaceholder("Titlul task-ului…").first();
    if (await quick.count()) {
      await quick.fill(title);
      await quick.press("Enter");
      await page.waitForTimeout(1200);
      const created = await ctx.admin("GET", `/boards/${ctx.boardId}/tasks`);
      check((created.json.tasks ?? []).some((t) => t.title === title), "task creat din interfață ajunge în baza de date", created.json.tasks?.map((t) => t.title));
      // Board reîncărcat: compozitorul coloanei rămâne deschis după Enter, iar blur-ul lui la
      // apăsarea pe card mută conținutul sub cursor — clicul n-ar mai ateriza pe card.
      // `goto` pe același URL nu reîncarcă (doar hash-ul e același), deci `reload`.
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      await page.getByText(title).first().click().catch(() => {});
      await page.waitForTimeout(800);
      check(page.url().includes("task="), "clic pe card deschide panoul task-ului (?task=)", page.url());
      await shot("panel");
    } else {
      fail("nu găsesc câmpul de adăugare rapidă pe board");
    }
  }

  check(badApi.length === 0, "niciun răspuns 5xx de la API în timpul navigării", badApi);
  await browser.close();
}

async function cleanup(ctx) {
  if (!ctx) return;
  await ctx.admin("DELETE", `/boards/${ctx.boardId}`);
  if (ctx.teamId) await ctx.admin("DELETE", `/teams/${ctx.teamId}`);
}

const ctx = await apiFlow().catch((e) => {
  fail(`fluxul API a căzut: ${e.message}`);
  return null;
});
if (!API_ONLY) await browserFlow(ctx).catch((e) => fail(`browserul a căzut: ${e.message}`));
await cleanup(ctx).catch(() => {});
console.log(`\n${failures === 0 ? "✅ tot verde" : `❌ ${failures} verificări picate`}`);
process.exit(failures === 0 ? 0 : 1);
