// PLATFORM-001 — smoke live pentru Consola Platformă. Rulează pe un server local pornit + seed.
//   npm run db:reset && npm run db:seed && PORT=3100 npm run server:dev
//   BASE_URL=http://localhost:3100 node scripts/e2e-platform-console.mjs
//
// De ce există pe lângă testele vitest: testele rulează pe PGlite în proces și trec chiar
// și când aplicația integrată e ruptă (rută nemontată, middleware în ordine greșită, CORS).
// Aici se cheamă serverul REAL, prin HTTP, cu o sesiune reală prin cookie.
//
// Fiecare verificare INVOCĂ acțiunea și îi validează răspunsul — nu se mulțumește să
// constate că ruta răspunde ceva (CLAUDE.md §3.5.1quater).
import { request } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = "demo123456";
const OWNER = "admin@atic.demo.io"; // seed-ul îl trece în platform_admins
const PLAIN = "approver@atic.demo.io"; // utilizator obișnuit, fără drepturi de platformă

let owner;
let plain;
let n = 0;
let pass = 0;
const failures = [];

function check(name, ok, detail = "") {
  n++;
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(ctx, method, path, body) {
  const res = await ctx[method.toLowerCase()](path, body !== undefined ? { data: body } : {});
  let json = null;
  let text = null;
  const type = res.headers()["content-type"] ?? "";
  if (type.includes("application/json")) {
    try {
      json = await res.json();
    } catch {
      /* corp gol */
    }
  } else {
    text = await res.text();
  }
  return { status: res.status(), json, text, type };
}

async function main() {
  console.log(`\n▶ Consola Platformă — smoke live pe ${BASE}\n`);

  owner = await request.newContext({ baseURL: BASE });
  plain = await request.newContext({ baseURL: BASE });

  const loginOwner = await call(owner, "POST", "/api/business/auth/login", { email: OWNER, password: PW });
  check("login superadmin (200)", loginOwner.status === 200, `status ${loginOwner.status}`);
  if (loginOwner.status !== 200) {
    console.log("\n⚠ Fără sesiune de superadmin restul verificărilor nu au sens. Ai rulat db:seed?\n");
    process.exit(1);
  }
  await call(plain, "POST", "/api/business/auth/login", { email: PLAIN, password: PW });

  // ── acces ──────────────────────────────────────────────────────────────────
  const denied = await call(plain, "GET", "/api/platform/workspaces");
  check("un utilizator obișnuit primește 403", denied.status === 403, `status ${denied.status}`);

  // ── catalog + implicite ────────────────────────────────────────────────────
  const catalog = await call(owner, "GET", "/api/platform/catalog");
  check(
    "GET /catalog întoarce 4 module + implicitele",
    catalog.status === 200 && catalog.json?.modules?.length === 4 && !!catalog.json?.defaults,
    `status ${catalog.status}`,
  );

  const beforeDefault = catalog.json?.defaults?.docmerge;
  const setDefault = await call(owner, "PUT", "/api/platform/catalog/defaults", {
    module: "docmerge",
    enabled: !beforeDefault,
  });
  check("PUT /catalog/defaults comută implicita", setDefault.status === 200, `status ${setDefault.status}`);
  const afterDefault = await call(owner, "GET", "/api/platform/catalog");
  check(
    "implicita chiar s-a schimbat la re-citire",
    afterDefault.json?.defaults?.docmerge === !beforeDefault,
    JSON.stringify(afterDefault.json?.defaults),
  );
  // restaurăm starea inițială — un smoke nu are voie să lase mediul schimbat
  await call(owner, "PUT", "/api/platform/catalog/defaults", { module: "docmerge", enabled: beforeDefault });

  const badModule = await call(owner, "PUT", "/api/platform/catalog/defaults", { module: "inventat", enabled: true });
  check("o cheie de modul necunoscută e refuzată cu 400", badModule.status === 400, `status ${badModule.status}`);

  const applied = await call(owner, "POST", "/api/platform/catalog/apply-defaults", { overwrite: false });
  check(
    "POST /catalog/apply-defaults completează lipsurile",
    applied.status === 200 && typeof applied.json?.workspaces === "number",
    `status ${applied.status}`,
  );

  // ── ansamblu ───────────────────────────────────────────────────────────────
  const overview = await call(owner, "GET", "/api/platform/overview");
  check(
    "GET /overview întoarce KPI-uri complete",
    overview.status === 200 &&
      typeof overview.json?.workspaces?.total === "number" &&
      Array.isArray(overview.json?.adoption) &&
      Array.isArray(overview.json?.plans),
    `status ${overview.status}`,
  );

  // ── workspace-uri ──────────────────────────────────────────────────────────
  const list = await call(owner, "GET", "/api/platform/workspaces");
  check(
    "GET /workspaces întoarce lista cu statistici",
    list.status === 200 && Array.isArray(list.json?.workspaces) && list.json.workspaces.length > 0,
    `status ${list.status}`,
  );
  const target = list.json?.workspaces?.find((w) => w.appKind === "business") ?? list.json?.workspaces?.[0];
  check(
    "un workspace are toate câmpurile de statistică",
    !!target &&
      typeof target.userCount === "number" &&
      typeof target.logins30d === "number" &&
      typeof target.churnRisk === "boolean" &&
      !!target.modules,
    JSON.stringify(target ?? {}).slice(0, 160),
  );

  const csv = await call(owner, "GET", "/api/platform/workspaces?format=csv");
  check(
    "GET /workspaces?format=csv livrează CSV, nu JSON",
    csv.status === 200 && csv.type.includes("text/csv") && (csv.text ?? "").includes("Workspace"),
    `type ${csv.type}`,
  );

  const detail = await call(owner, "GET", `/api/platform/workspaces/${target.id}`);
  check(
    "GET /workspaces/:id întoarce membri + logări + note",
    detail.status === 200 &&
      Array.isArray(detail.json?.members) &&
      Array.isArray(detail.json?.recentLogins) &&
      Array.isArray(detail.json?.notes),
    `status ${detail.status}`,
  );

  const missing = await call(owner, "GET", "/api/platform/workspaces/00000000-0000-0000-0000-000000000000");
  check("un id inexistent dă 404, nu 500", missing.status === 404, `status ${missing.status}`);

  const badId = await call(owner, "GET", "/api/platform/workspaces/nu-e-uuid");
  check("un id care nu e uuid dă 404, nu 500", badId.status === 404, `status ${badId.status}`);

  // Comutăm un modul și verificăm că se vede în /api/modules al aceluiași workspace.
  const before = target.modules.itpark !== false;
  const toggled = await call(owner, "PUT", `/api/platform/workspaces/${target.id}/modules`, {
    module: "itpark",
    enabled: !before,
  });
  check("PUT /workspaces/:id/modules comută modulul", toggled.status === 200, `status ${toggled.status}`);
  const mine = await call(owner, "GET", "/api/modules");
  check(
    "GET /api/modules reflectă comutatorul pentru workspace-ul propriu",
    mine.status === 200 && Array.isArray(mine.json?.enabled),
    `status ${mine.status}`,
  );
  await call(owner, "PUT", `/api/platform/workspaces/${target.id}/modules`, { module: "itpark", enabled: before });

  const note = await call(owner, "POST", `/api/platform/workspaces/${target.id}/notes`, {
    body: `Notă de la smoke — ${new Date().toISOString()}`,
  });
  check("POST /workspaces/:id/notes salvează nota (201)", note.status === 201 && !!note.json?.note?.id, `status ${note.status}`);

  const planBefore = target.plan;
  const planRes = await call(owner, "PUT", `/api/platform/workspaces/${target.id}/plan`, { plan: "growth" });
  check("PUT /workspaces/:id/plan schimbă planul", planRes.status === 200, `status ${planRes.status}`);
  await call(owner, "PUT", `/api/platform/workspaces/${target.id}/plan`, { plan: planBefore });

  // ── logări ─────────────────────────────────────────────────────────────────
  // Login-ul de superadmin de la începutul rulării TREBUIE să apară deja în istoric.
  const logins = await call(owner, "GET", "/api/platform/logins?days=1");
  check(
    "GET /logins conține logarea de acum",
    logins.status === 200 && (logins.json?.events ?? []).some((e) => e.email === OWNER && e.success),
    `status ${logins.status}, ${logins.json?.total ?? 0} evenimente`,
  );

  // O încercare eșuată trebuie să lase urmă — altfel istoricul nu vede atacurile.
  const badEmail = `smoke-fail-${Date.now()}@nicaieri.md`;
  await call(owner, "POST", "/api/business/auth/login", { email: badEmail, password: "gresit" });
  const failed = await call(owner, "GET", `/api/platform/logins?result=failed&days=1&q=${encodeURIComponent(badEmail)}`);
  check(
    "o logare EȘUATĂ pe un email inexistent e înregistrată",
    failed.status === 200 && (failed.json?.events ?? []).some((e) => e.email === badEmail && !e.success),
    `status ${failed.status}`,
  );

  const loginsCsv = await call(owner, "GET", "/api/platform/logins?format=csv&days=1");
  check(
    "GET /logins?format=csv livrează CSV",
    loginsCsv.status === 200 && loginsCsv.type.includes("text/csv"),
    `type ${loginsCsv.type}`,
  );

  // ── superadmini + audit ────────────────────────────────────────────────────
  const admins = await call(owner, "GET", "/api/platform/admins");
  check(
    "GET /admins listează superadminii",
    admins.status === 200 && Array.isArray(admins.json?.admins) && admins.json.admins.length > 0,
    `status ${admins.status}`,
  );
  const self = admins.json?.self;
  const selfRemove = await call(owner, "DELETE", `/api/platform/admins/${self}`);
  check("nu mă pot retrage pe mine însumi (400)", selfRemove.status === 400, `status ${selfRemove.status}`);

  const ghost = await call(owner, "POST", "/api/platform/admins", { email: "fantoma@nicaieri.md" });
  check("promovarea unui email fără cont dă 404", ghost.status === 404, `status ${ghost.status}`);

  const audit = await call(owner, "GET", "/api/platform/audit");
  check(
    "GET /audit arată acțiunile tocmai făcute",
    audit.status === 200 &&
      (audit.json?.entries ?? []).some((e) => e.action === "module.toggle" || e.action === "defaults.update"),
    `status ${audit.status}`,
  );

  console.log(`\n${pass}/${n} verificări trecute.`);
  if (failures.length) {
    console.log("\nEșecuri:");
    failures.forEach((f) => console.log(`  • ${f}`));
    process.exit(1);
  }
  console.log("Consola Platformă răspunde corect pe serverul real.\n");
}

main().catch((err) => {
  console.error("Smoke-ul a picat cu o excepție:", err);
  process.exit(1);
});
