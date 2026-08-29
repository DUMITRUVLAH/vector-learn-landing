// Poarta E2E — se rulează DUPĂ FIECARE modificare, înainte de commit.
//
// De ce există: cele 28 de scripturi `scripts/e2e-*.mjs` testează bine, dar nimeni nu știe
// pe care să le ruleze după o schimbare, iar `npm run smoke` măturase ani de zile 40 de rute
// `/#/app/*` care NU MAI EXISTĂ (aplicația a migrat pe `/business/*` — fiecare rută cădea pe
// fallback-ul SPA și „trecea" fără să testeze nimic). Poarta asta face trei lucruri:
//
//   1. rulează gărzile statice (referințe nedefinite, rute nemontate, breakpoint-uri migrări);
//   2. cheamă REAL, prin HTTP, endpoint-urile zonei pe care tocmai ai atins-o + un nucleu fix;
//   3. opțional, deschide un browser real pe rutele care există CU ADEVĂRAT azi.
//
// Zona se deduce singură din `git diff` — nu trebuie să ții minte ce script se potrivește.
//
// Utilizare:
//   node scripts/e2e-gate.mjs               # rapid (~20s): gărzi + API pe zona atinsă
//   node scripts/e2e-gate.mjs --browser     # + build dist + măturare în browser real
//   node scripts/e2e-gate.mjs --deep        # + suitele grele ale zonei (e2e-par-sweep etc.)
//   node scripts/e2e-gate.mjs --area par    # forțează zona, în loc s-o deducă din git
//
// Serverul: refolosește unul care rulează deja (3131/3100/3000/3132). Dacă niciunul nu
// răspunde, îl pornește singur și îl oprește la final. NU pornește un al doilea server în
// același director dacă unul rulează — PGlite ține `.pglite` exclusiv și al doilea moare.
import { request } from "playwright-core";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PW = process.env.E2E_PASSWORD ?? "demo123456";
const ADMIN = process.env.E2E_EMAIL ?? "admin@atic.demo.io";
const PORTS = [process.env.E2E_PORT, "3131", "3100", "3000", "3132"].filter(Boolean);

const args = process.argv.slice(2);
const WANT_BROWSER = args.includes("--browser") || args.includes("--all");
const WANT_DEEP = args.includes("--deep") || args.includes("--all");
const FORCED_AREA = args.includes("--area") ? args[args.indexOf("--area") + 1] : null;

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

// ── 1. Ce s-a schimbat → ce zone atingem ─────────────────────────────────────
// Zonele sunt deliberat puține: mai bine rulezi ceva în plus decât să ratezi zona ruptă.
const AREAS = {
  par: {
    label: "PAR",
    // Paginile PAR trăiesc în `src/pages/par/`, NU în `src/pages/business/par/` — tiparul vechi
    // cerea o cale care nu există, deci o schimbare în ParCreateForm/ParDashboard nu declanșa
    // zona PAR: poarta rula doar nucleul și raporta verde fără să atingă niciun ecran de cerere.
    match: /(server\/(routes|lib)\/par|server\/db\/schema\/par|src\/(pages|components)\/([Pp]ar\/|business\/[Pp]ar)|src\/lib\/(api\/)?par)/,
    // Fiecare verificare INVOCĂ ruta și îi validează forma răspunsului (CLAUDE.md §3.5.1quater).
    api: [
      ["GET", "/api/par", (j) => Array.isArray(j?.requests)],
      ["GET", "/api/par/me", (j) => Array.isArray(j?.roles)],
      ["GET", "/api/par/projects", (j) => Array.isArray(j?.projects)],
      ["GET", "/api/par/vendors", (j) => Array.isArray(j?.vendors)],
      ["GET", "/api/par/departments", (j) => !!j],
      ["GET", "/api/par/activity", (j) => Array.isArray(j?.items)],
      // Codurile bugetare au monedă proprie (MDL/EUR/USD): răspunsul trebuie să o poarte, iar
      // consumul să vină convertit în lei — altfel un plafon în EUR e citit ca lei (de ~20× mai mic).
      ["GET", "/api/par/budget-codes", (j) => Array.isArray(j?.budgetCodes)],
      ["GET", "/api/par/budget-codes/usage", (j) => Array.isArray(j?.usage) && j.usage.every((u) => typeof u.currency === "string" && typeof u.allocatedCents === "number")],
      // Cursul BNM (FX-001): tabloul zilei, conversia și seria pentru grafic. Verificăm FORMA,
      // nu doar 200: `mdl_per_unit` e cursul pe O unitate, iar `value` cel publicat de BNM
      // pentru `nominal` unități — confundate, un calcul cu ALL/JPY iese de 10–100× greșit.
      ["GET", "/api/par/fx/rates", (j) => Array.isArray(j?.rates) && j.rates.some((r) => r.code === "EUR" && r.mdl_per_unit > 0) && typeof j.effective_date === "string"],
      ["GET", "/api/par/fx/convert?from=EUR&to=MDL&amount=100", (j) => typeof j?.rate === "number" && Math.abs(j.result - j.amount * j.rate) < 0.01],
      ["GET", "/api/par/fx/series?codes=EUR,USD&days=7", (j) => Array.isArray(j?.points) && j.points.every((p) => typeof p.date === "string")],
    ],
    routes: ["/business/par", "/business/par/inbox", "/business/par/new", "/business/par/folders", "/business/par/finance", "/business/par/reports", "/business/par/exchange", "/business/par/admin"],
    deep: ["e2e-par-sweep.mjs", "e2e-par-write-sweep.mjs", "e2e-par-scope.mjs", "e2e-par-timeline-human.mjs", "e2e-par-patenta.mjs"],
  },
  fin: {
    label: "FinDesk",
    match: /(server\/(routes|lib)\/fin|server\/db\/schema\/fin|src\/pages\/business\/fin|src\/lib\/api\/fin)/i,
    api: [
      ["GET", "/api/fin/invoices", (j) => !!j],
      ["GET", "/api/fin/parties", (j) => !!j],
      ["GET", "/api/fin/ledger/accounts", (j) => !!j],
    ],
    routes: ["/business/fin/invoices", "/business/fin/expenses", "/business/fin/captures", "/business/fin/parties", "/business/fin/statement"],
    deep: ["e2e-crud.mjs"],
  },
  platform: {
    label: "Consola platformă",
    match: /(server\/routes\/(platform|impersonation|telemetry|modules)|src\/pages\/business\/Platform|src\/lib\/(platform|modules))/i,
    api: [
      ["GET", "/api/platform/catalog", (j) => Array.isArray(j?.modules)],
      ["GET", "/api/platform/workspaces", (j) => !!j],
      ["GET", "/api/modules", (j) => Array.isArray(j?.modules)],
    ],
    routes: ["/business/platform"],
    deep: ["e2e-platform-console.mjs", "e2e-platform-telemetry.mjs"],
  },
  docgen: {
    label: "Acte (DOCGEN)",
    // Atenție la ordine: „docs" prinde și rutele, și schema, și clientul API al modulului de acte.
    match: /(server\/routes\/docs|server\/db\/(schema\/docs|ensure\/docgen)|src\/pages\/business\/docs|src\/lib\/api\/docs)/,
    // Verificăm FORMA, nu doar 200: lista trebuie să fie un tablou de acte, nu un obiect de eroare.
    api: [
      ["GET", "/api/docs/documents", (j) => Array.isArray(j)],
      ["GET", "/api/docs/documents?status=final", (j) => Array.isArray(j) && j.every((d) => d.status === "final")],
    ],
    routes: ["/business/docs"],
    deep: [],
  },
  docmerge: {
    label: "DocMerge",
    match: /(docmerge|DocMerge)/,
    api: [["GET", "/api/docmerge/templates", (j) => !!j]],
    routes: ["/business/docmerge"],
    deep: [],
  },
  shell: {
    label: "Shell / navigație",
    match: /(BusinessShell|AppShell|ParShell|src\/components\/ds\/|src\/App\.tsx)/,
    api: [["GET", "/api/modules", (j) => Array.isArray(j?.modules)]],
    routes: ["/business/dashboard", "/business/par", "/business/fin/invoices"],
    deep: [],
  },
};

// Nucleul rulează mereu: dacă astea pică, nimic altceva nu mai contează.
const CORE_API = [
  ["GET", "/api/health", (j) => j?.ok === true],
  ["GET", "/api/health/db", (j) => j?.db === "connected" || j?.ok === true],
  ["GET", "/api/modules", (j) => Array.isArray(j?.modules)],
  ["GET", "/api/notifications", (j) => Array.isArray(j?.items)],
];
const CORE_ROUTES = ["/business/dashboard"];

function changedFiles() {
  const out = (cmd, a) => {
    try {
      return execFileSync(cmd, a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  // „Ce am modificat" = ce e nesalvat + ce a intrat în ultimul commit. Doar `diff HEAD`
  // ar returna gol imediat după un commit — exact momentul în care vrei să rulezi poarta.
  return [
    ...out("git", ["diff", "--name-only", "HEAD"]),
    ...out("git", ["ls-files", "--others", "--exclude-standard"]),
    ...out("git", ["diff", "--name-only", "HEAD~1", "HEAD"]),
    // …și TOATĂ livrarea față de `main`, nu doar ultimul commit: după un rebase sau când
    // livrezi două commit-uri (feature + fix de unealtă), `HEAD~1` arată doar pe ultimul —
    // poarta raporta „nicio zonă detectată" fix pe schimbarea pe care urma s-o trimiți în prod.
    ...out("git", ["diff", "--name-only", "origin/main...HEAD"]),
  ];
}

function detectAreas() {
  if (FORCED_AREA) return FORCED_AREA.split(",").filter((a) => AREAS[a]);
  const files = changedFiles();
  const hit = Object.keys(AREAS).filter((k) => files.some((f) => AREAS[k].match.test(f)));
  return hit;
}

// ── 2. Gărzi statice ─────────────────────────────────────────────────────────
function staticGuards() {
  console.log("\n▶ Gărzi statice");
  const guards = [
    ["referințe nedefinite", "check-undefined-refs.mjs"],
    ["rute montate", "check-route-mounts.mjs"],
    ["breakpoint-uri migrări", "check-migration-breakpoints.mjs"],
  ];
  for (const [label, script] of guards) {
    try {
      execFileSync("node", [path.join("scripts", script)], { cwd: ROOT, stdio: "pipe" });
      check(label, true);
    } catch (e) {
      const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim().split("\n").slice(-6).join(" | ");
      check(label, false, out.slice(0, 400));
    }
  }
}

// ── 3. Server: refolosește sau pornește ──────────────────────────────────────
let bootedProc = null;

async function findServer() {
  // Un BASE_URL explicit (preview Vercel, prod) e o adresă, nu un port local: o verificăm
  // și ne oprim dacă nu răspunde. Pornirea unui server local ar testa altceva decât ai cerut.
  if (process.env.BASE_URL) {
    const url = process.env.BASE_URL.replace(/\/$/, "");
    const ctx = await request.newContext({ baseURL: url, timeout: 15000 });
    const res = await ctx.get("/api/health").catch(() => null);
    await ctx.dispose();
    if (res?.status() === 200) return url;
    throw new Error(`BASE_URL=${url} nu răspunde la /api/health (${res?.status() ?? "fără răspuns"})`);
  }
  for (const port of PORTS) {
    const url = `http://localhost:${port}`;
    try {
      const ctx = await request.newContext({ baseURL: url, timeout: 3000 });
      const res = await ctx.get("/api/health");
      await ctx.dispose();
      if (res.status() === 200) return url;
    } catch {
      /* portul e liber */
    }
  }
  return null;
}

async function serverAlive(base) {
  try {
    const ctx = await request.newContext({ baseURL: base, timeout: 4000 });
    const res = await ctx.get("/api/health");
    await ctx.dispose();
    return res.status() === 200;
  } catch {
    return false;
  }
}

async function bootServer() {
  const port = process.env.E2E_PORT ?? "3131";
  console.log(`  … niciun server activ, pornesc unul pe :${port}`);
  bootedProc = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const ctx = await request.newContext({ baseURL: url, timeout: 2000 });
      const res = await ctx.get("/api/health");
      await ctx.dispose();
      if (res.status() === 200) return url;
    } catch {
      /* încă pornește */
    }
  }
  throw new Error("serverul nu a pornit în 60s");
}

// ── 3bis. Sesiune refolosită între rulări ────────────────────────────────────
// `authRateLimit` permite 10 autentificări / 15 minute / IP / rută (server/middleware/rateLimit.ts).
// O poartă care se rulează după FIECARE modificare ar epuiza cota în câteva minute și ar
// raporta „login eșuat" în loc de starea reală a codului. Deci ne autentificăm o singură dată
// și păstrăm cookie-ul pe disc; îl reîmprospătăm doar când serverul îl refuză.
const SESSION_FILE = path.join(ROOT, ".e2e-session.json");

async function sessionContext(base) {
  if (existsSync(SESSION_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
      if (saved.base === base) {
        const ctx = await request.newContext({ baseURL: base, storageState: saved.state });
        const probe = await ctx.get("/api/modules");
        if (probe.status() === 200) {
          check("sesiune refolosită (fără login nou)", true);
          return ctx;
        }
        await ctx.dispose();
      }
    } catch {
      /* cache stricat — ne autentificăm din nou */
    }
    try {
      unlinkSync(SESSION_FILE);
    } catch {
      /* ignorăm */
    }
  }

  const ctx = await request.newContext({ baseURL: base });
  const login = await ctx.post("/api/business/auth/login", { data: { email: ADMIN, password: PW } });
  if (login.status() === 429) {
    check(`login ${ADMIN}`, false, "429 too_many_attempts — cota de 10/15min e epuizată; repornește serverul sau așteaptă");
    return null;
  }
  check(`login ${ADMIN} (200)`, login.status() === 200, `status ${login.status()}`);
  if (login.status() !== 200) {
    console.log("\n⚠ Fără sesiune restul verificărilor n-au sens. Ai rulat `npm run db:seed`?");
    await ctx.dispose();
    return null;
  }
  writeFileSync(SESSION_FILE, JSON.stringify({ base, state: await ctx.storageState() }));
  return ctx;
}

// ── 4. Măturare API ──────────────────────────────────────────────────────────
async function apiSweep(base, areas, ctx) {
  console.log(`\n▶ API real pe ${base}`);

  const checks = [...CORE_API, ...areas.flatMap((a) => AREAS[a].api)];
  const seen = new Set();
  for (const [method, url, shape] of checks) {
    if (seen.has(`${method} ${url}`)) continue;
    seen.add(`${method} ${url}`);
    const res = await ctx.fetch(url, { method });
    const type = res.headers()["content-type"] ?? "";
    // HTML pe /api/* = ruta nu e montată și cererea a căzut pe fallback-ul SPA.
    // Exact bug-ul care se manifestă în browser ca `JSON.parse('<!doctype …')`.
    if (!type.includes("application/json")) {
      check(`${method} ${url}`, false, `content-type ${type || "necunoscut"} (rută nemontată?)`);
      continue;
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* corp gol */
    }
    check(`${method} ${url}`, res.status() === 200 && shape(json), `status ${res.status()}`);
  }
}

// ── 5. Măturare în browser real ──────────────────────────────────────────────
// Textele de mai jos sunt erori PRINSE și randate ca text roșu — `pageerror` nu le vede,
// pentru că nimic nu e aruncat. Post-mortemul din 2026-06-02 pe asta s-a împiedicat.
const ERR_PATTERNS = [
  "does not exist", "Internal Server", "http_500", "http_404", "is not defined",
  "Eroare la", "null value", "violates", "Cannot read", "invalid input",
  "Failed to fetch", "Unexpected token", "relation ", "undefined is not",
];

function distIsStale() {
  const index = path.join(ROOT, "dist", "index.html");
  if (!existsSync(index)) return true;
  const built = statSync(index).mtimeMs;
  const newest = (dir) => {
    let max = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      max = Math.max(max, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
    }
    return max;
  };
  return newest(path.join(ROOT, "src")) > built;
}

async function browserSweep(base, areas, ctx) {
  if (distIsStale()) {
    console.log("\n▶ dist/ e vechi față de src/ — rebuild (durează ~30s)");
    execFileSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  }
  console.log("\n▶ Browser real");
  const { chromium } = await import("playwright-core");
  const CHROME = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => existsSync(p));
  if (!CHROME) {
    check("browser disponibil", false, "setează CHROME_PATH");
    return;
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  // Refolosim cookie-ul obținut deja prin API, ca să nu consumăm din cota de autentificări.
  // `--login` forțează parcurgerea reală a formularului, când chiar el e ce vrei verificat.
  const state = await ctx.storageState();
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(String(e.message).slice(0, 200)));

  if (args.includes("--login")) {
    await page.goto(`${base}/#/business/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', ADMIN);
    await page.fill('input[type="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const stuck = page.url().includes("/business/login");
    const why = stuck ? await page.evaluate(() => document.body?.innerText ?? "") : "";
    check("formularul de login duce în aplicație", !stuck, why.includes("too_many_attempts") ? "429 too_many_attempts — repornește serverul" : why.slice(0, 120));
  }

  const routes = [...new Set([...CORE_ROUTES, ...areas.flatMap((a) => AREAS[a].routes)])];
  for (const route of routes) {
    crashes.length = 0;
    await page.goto(`${base}/#${route}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(900);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    // Verificarea CARE LIPSEA din vechiul `e2e-smoke.mjs`: o pagină care te aruncă la login
    // are text destul și niciun cuvânt de eroare, deci trecea verde fără să fi fost testată.
    // La fel și o rută inexistentă, care cădea pe dashboard. Ambele trebuie să pice.
    const redirected = !page.url().includes(route);
    const hit = ERR_PATTERNS.find((p) => text.includes(p));
    const blank = text.trim().length < 40;
    check(
      `pagina ${route}`,
      !redirected && !hit && !blank && crashes.length === 0,
      redirected ? `redirecționat la ${page.url().split("#")[1] ?? page.url()}` :
      hit ? `text de eroare: „${hit}"` :
      blank ? "pagină goală (ecran alb)" : crashes[0] ?? "",
    );
  }
  await browser.close();
}

// ── 6. Suitele grele ale zonei ───────────────────────────────────────────────
async function deepSuites(base, areas) {
  const scripts = [...new Set(areas.flatMap((a) => AREAS[a].deep))];
  if (!scripts.length) return;
  console.log("\n▶ Suite dedicate");
  for (const s of scripts) {
    try {
      execFileSync("node", [path.join("scripts", s)], {
        cwd: ROOT,
        stdio: "pipe",
        env: { ...process.env, BASE_URL: base, BASE: base },
        timeout: 300000,
      });
      check(s, true);
    } catch (e) {
      // Serverul poate dispărea sub noi: în acest depozit lucrează mai multe conversații în
      // paralel (CLAUDE.md §0.4) și oricare poate reporni serverul. Un „❌ suită picată" în
      // acel caz e o minciună — suita n-a apucat să ruleze. Deci întrebăm serverul, apoi decidem.
      const alive = await serverAlive(base);
      if (!alive) {
        check(s, false, `serverul de pe ${base} a dispărut în timpul rulării — repornește-l și reia`);
        continue;
      }
      // Motivul real: întâi liniile marcate de scriptul însuși, altfel coada ieșirii.
      const raw = `${e.stdout ?? ""}${e.stderr ?? ""}`.split("\n").filter((l) => l.trim());
      const marked = raw.filter((l) => l.includes("❌") || l.startsWith("FATAL"));
      const detail = (marked.length ? marked : raw.slice(-6)).slice(0, 6).join(" | ");
      check(s, false, detail.slice(0, 600) || `ieșire ${e.status ?? "necunoscută"}`);
    }
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const areas = detectAreas();
  console.log(`\n═══ Poarta E2E — zone atinse: ${areas.length ? areas.map((a) => AREAS[a].label).join(", ") : "niciuna detectată (rulez doar nucleul)"} ═══`);

  staticGuards();

  let base = await findServer();
  if (!base) base = await bootServer();
  else console.log(`\n  ↻ refolosesc serverul de pe ${base}`);

  const ctx = await sessionContext(base);
  if (ctx) {
    await apiSweep(base, areas, ctx);
    if (WANT_DEEP) await deepSuites(base, areas);
    if (WANT_BROWSER) await browserSweep(base, areas, ctx);
    await ctx.dispose();
  }

  if (bootedProc) bootedProc.kill();

  console.log(`\n═══ ${pass}/${n} au trecut ═══`);
  if (failures.length) {
    console.log("\nCe e rupt:");
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  }
  console.log("Nimic rupt în zonele atinse.\n");
}

main().catch((e) => {
  if (bootedProc) bootedProc.kill();
  console.error("\n💥 Poarta a murit:", e.message);
  process.exit(1);
});
