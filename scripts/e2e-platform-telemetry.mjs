// PLATFORM-002 — smoke live pentru telemetria de erori + semnalele de creștere.
//   npm run db:reset && npm run db:seed && PORT=3100 npx tsx server/index.ts
//   BASE_URL=http://localhost:3100 node scripts/e2e-platform-telemetry.mjs
//
// Verificarea centrală: PROVOC o eroare reală prin HTTP și confirm că apare în consolă.
// Un test care doar cheamă `GET /errors` și primește 200 nu dovedește că telemetria prinde
// ceva — dovedește doar că lista se încarcă.
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = "demo123456";
const OWNER = "admin@atic.demo.io";
const PLAIN = "approver@atic.demo.io";

let n = 0;
let pass = 0;
const failures = [];
function check(name, ok, detail = "") {
  n++;
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function call(ctx, method, path, body) {
  const res = await ctx[method.toLowerCase()](path, body !== undefined ? { data: body } : {});
  const type = res.headers()["content-type"] ?? "";
  let json = null, text = null;
  if (type.includes("application/json")) { try { json = await res.json(); } catch { /* corp gol */ } }
  else text = await res.text();
  return { status: res.status(), json, text, type };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n▶ Telemetrie + creștere — smoke live pe ${BASE}\n`);
  const owner = await request.newContext({ baseURL: BASE });
  const plain = await request.newContext({ baseURL: BASE });
  const anon = await request.newContext({ baseURL: BASE });

  const login = await call(owner, "POST", "/api/business/auth/login", { email: OWNER, password: PW });
  check("login superadmin", login.status === 200, `status ${login.status}`);
  if (login.status !== 200) { console.log("\n⚠ Fără sesiune nu are sens restul. Ai rulat db:seed?\n"); process.exit(1); }
  await call(plain, "POST", "/api/business/auth/login", { email: PLAIN, password: PW });

  // ── captarea automată: provocăm o rută API inexistentă ─────────────────────
  // Marker DOAR din litere: amprentarea normalizează cifrele (`123` → `<n>`), deci un marker
  // numeric ar cădea în același grup ca rulările anterioare și verificarea ar fi falsă.
  const marker = "smoke" + Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
  const missing = await call(anon, "GET", `/api/${marker}`);
  check("o rută API inexistentă răspunde 404", missing.status === 404, `status ${missing.status}`);
  await sleep(600);

  const afterMissing = await call(owner, "GET", "/api/platform/errors?status=all&days=1");
  const caughtMissing = (afterMissing.json?.groups ?? []).some(
    (g) => g.kind === "api_route_missing" && (g.location ?? "").includes(marker),
  );
  check("404-ul pe /api/* a ajuns AUTOMAT în consolă", caughtMissing,
    `${afterMissing.json?.groups?.length ?? 0} grupuri`);

  // ── erorile din browser ────────────────────────────────────────────────────
  const crashMsg = `Cannot read properties of undefined (${marker})`;
  const reported = await call(anon, "POST", "/api/telemetry/error", {
    kind: "client_crash",
    message: crashMsg,
    stack: "at SomeComponent",
    location: "/business/par",
    url: `${BASE}/#/business/par`,
  });
  check("POST /api/telemetry/error acceptă raportul din browser", reported.status === 200, `status ${reported.status}`);
  await sleep(500);

  const afterCrash = await call(owner, "GET", "/api/platform/errors?status=all&days=1");
  const crashGroup = (afterCrash.json?.groups ?? []).find((g) => g.title.includes(marker));
  check("crash-ul din browser apare în listă", !!crashGroup, `${afterCrash.json?.groups?.length ?? 0} grupuri`);

  const badReport = await call(anon, "POST", "/api/telemetry/error", {
    kind: "server_exception",
    message: "încerc să mă dau drept server",
  });
  check("un raport care minte despre tipul erorii e respins (400)", badReport.status === 400, `status ${badReport.status}`);

  // ── gruparea: a doua apariție nu creează un grup nou ───────────────────────
  if (crashGroup) {
    await call(anon, "POST", "/api/telemetry/error", {
      kind: "client_crash", message: crashMsg, location: "/business/par",
    });
    await sleep(500);
    const regrouped = await call(owner, "GET", "/api/platform/errors?status=all&days=1");
    const same = (regrouped.json?.groups ?? []).filter((g) => g.title.includes(marker));
    check("două apariții = UN grup cu 2 apariții", same.length === 1 && same[0].occurrences >= 2,
      `${same.length} grupuri, ${same[0]?.occurrences} apariții`);

    const detail = await call(owner, "GET", `/api/platform/errors/${crashGroup.id}`);
    check("GET /errors/:id întoarce aparițiile", detail.status === 200 && (detail.json?.events?.length ?? 0) > 0,
      `status ${detail.status}`);

    const resolved = await call(owner, "PUT", `/api/platform/errors/${crashGroup.id}/status`, { status: "resolved" });
    check("PUT /errors/:id/status marchează rezolvat", resolved.status === 200, `status ${resolved.status}`);

    await call(anon, "POST", "/api/telemetry/error", { kind: "client_crash", message: crashMsg, location: "/business/par" });
    await sleep(500);
    const reopened = await call(owner, "GET", "/api/platform/errors?status=open&days=1");
    check("o eroare rezolvată care REAPARE se redeschide singură",
      (reopened.json?.groups ?? []).some((g) => g.title.includes(marker)));
  }

  // ── zgomotul nu intră ──────────────────────────────────────────────────────
  const beforeNoise = (await call(owner, "GET", "/api/platform/errors?status=all&days=1")).json?.groups?.length ?? 0;
  await call(anon, "GET", "/api/platform/workspaces"); // 401 curat
  await sleep(500);
  const afterNoise = (await call(owner, "GET", "/api/platform/errors?status=all&days=1")).json?.groups?.length ?? 0;
  check("un 401 normal NU poluează lista de erori", afterNoise === beforeNoise, `${beforeNoise} → ${afterNoise}`);

  // ── acces ──────────────────────────────────────────────────────────────────
  const deniedErrors = await call(plain, "GET", "/api/platform/errors");
  check("un utilizator obișnuit nu vede erorile (403)", deniedErrors.status === 403, `status ${deniedErrors.status}`);
  const deniedGrowth = await call(plain, "GET", "/api/platform/growth");
  check("un utilizator obișnuit nu vede datele de creștere (403)", deniedGrowth.status === 403, `status ${deniedGrowth.status}`);

  // ── creștere ───────────────────────────────────────────────────────────────
  const growth = await call(owner, "GET", "/api/platform/growth?days=90");
  check("GET /growth întoarce pâlnia + sursele + adopția + lista de sunat",
    growth.status === 200 &&
      typeof growth.json?.funnel?.signedUp === "number" &&
      Array.isArray(growth.json?.sources) &&
      Array.isArray(growth.json?.adoption) &&
      Array.isArray(growth.json?.callList),
    `status ${growth.status}`);
  check("adopția distinge „au acces” de „folosesc”",
    (growth.json?.adoption ?? []).every((a) => a.used <= a.enabled && "used" in a),
    JSON.stringify(growth.json?.adoption ?? []).slice(0, 140));

  const contacts = await call(owner, "GET", "/api/platform/growth/contacts.csv");
  check("export contacte în CSV", contacts.status === 200 && contacts.type.includes("text/csv"), `type ${contacts.type}`);
  check("CSV-ul conține un email real", (contacts.text ?? "").includes("@"), (contacts.text ?? "").slice(0, 80));

  console.log(`\n${pass}/${n} verificări trecute.`);
  if (failures.length) {
    console.log("\nEșecuri:");
    failures.forEach((f) => console.log(`  • ${f}`));
    process.exit(1);
  }
  console.log("Telemetria prinde erorile reale pe serverul real.\n");
}

main().catch((err) => { console.error("Smoke-ul a picat cu o excepție:", err); process.exit(1); });
