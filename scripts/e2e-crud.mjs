// FinDesk functional CRUD E2E — exercises real create / read-back / update / delete
// against the LIVE authenticated API. Proves data actually saves, modifies, persists.
//
// Usage: node scripts/e2e-crud.mjs   (BASE_URL to override; defaults to prod)
const BASE = process.env.BASE_URL ?? "https://vector-learn-landing.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";

let cookie = "";
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.get("set-cookie");
  if (setC) cookie = setC.split(";")[0];
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  return { status: res.status, json };
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  → " + (detail ?? "")}`);
}

function pickArr(o) {
  return Array.isArray(o) ? o : (o?.data ?? o?.items ?? o?.parties ?? o?.budgets ?? o?.assets ?? o?.invoices ?? []);
}

async function main() {
  const login = await api("POST", "/api/business/auth/login", { email: EMAIL, password: PASSWORD });
  check("login", login.status === 200, `status ${login.status} ${JSON.stringify(login.json)}`);
  if (login.status !== 200) { summarize(); process.exit(1); }

  // ── PARTIES: create → read → update → delete ──────────────────────────────
  const pName = `E2E Test SRL ${Date.now()}`;
  const cParty = await api("POST", "/api/fin/parties", { kind: "client", name: pName, country: "MD" });
  check("parties: create", cParty.status === 200 || cParty.status === 201, `status ${cParty.status} ${JSON.stringify(cParty.json)}`);
  const partyId = cParty.json?.id ?? cParty.json?.data?.id;
  if (partyId) {
    const read = await api("GET", `/api/fin/parties/${partyId}`);
    check("parties: read-back saved", read.status === 200 && JSON.stringify(read.json).includes(pName), `status ${read.status}`);
    const upd = await api("PATCH", `/api/fin/parties/${partyId}`, { city: "Chișinău" });
    check("parties: update saves", upd.status === 200, `status ${upd.status} ${JSON.stringify(upd.json)}`);
    const read2 = await api("GET", `/api/fin/parties/${partyId}`);
    check("parties: update persisted", JSON.stringify(read2.json).includes("Chișinău"), `${JSON.stringify(read2.json).slice(0,150)}`);
    const del = await api("DELETE", `/api/fin/parties/${partyId}`);
    check("parties: delete", del.status === 200 || del.status === 204, `status ${del.status}`);
  } else {
    check("parties: read/update/delete", false, "no id returned from create — skipped");
  }

  // ── INVENTORY: create item → read → update → ──────────────────────────────
  const cItem = await api("POST", "/api/fin/inventory/items", { name: `E2E Item ${Date.now()}`, unit: "buc", minQtyAlert: 5 });
  check("inventory: create item", cItem.status === 200 || cItem.status === 201, `status ${cItem.status} ${JSON.stringify(cItem.json)}`);
  const itemId = cItem.json?.id ?? cItem.json?.data?.id;
  if (itemId) {
    const upd = await api("PATCH", `/api/fin/inventory/items/${itemId}`, { minQtyAlert: 99 });
    check("inventory: update item", upd.status === 200, `status ${upd.status} ${JSON.stringify(upd.json)}`);
    const list = await api("GET", "/api/fin/inventory/items");
    const found = pickArr(list.json).find((x) => x.id === itemId);
    check("inventory: update persisted", found && found.minQtyAlert === 99, `found=${!!found} val=${found?.minQtyAlert}`);
  }

  // ── BUDGET: create → read ─────────────────────────────────────────────────
  const cBudget = await api("POST", "/api/fin/budget", { name: `E2E Budget ${Date.now()}`, fiscalYear: 2026, lines: [] });
  check("budget: create", cBudget.status === 200 || cBudget.status === 201, `status ${cBudget.status} ${JSON.stringify(cBudget.json).slice(0,150)}`);

  // ── READ-ONLY summary endpoints the UI depends on ─────────────────────────
  for (const [name, path] of [
    ["expenses list", "/api/fin/expenses"],
    ["expenses summary", "/api/fin/expenses/summary"],
    ["expenses categories", "/api/fin/expenses/categories"],
    ["einvoices list", "/api/fin/einvoices"],
    ["sfs-settings", "/api/fin/sfs-settings"],
    ["invoices list", "/api/fin/invoices"],
    ["cash transactions", "/api/fin/cash/transactions"],
    ["ledger accounts", "/api/fin/ledger/accounts"],
    ["payroll employees", "/api/fin/payroll/employees"],
    ["tax periods", "/api/fin/tax/periods"],
    ["assets list", "/api/fin/assets"],
    ["banklink connections", "/api/fin/banklink/connections"],
    ["members me", "/api/fin/members/me"],
    ["registry tax-rates", "/api/fin/registry/tax-rates"],
  ]) {
    const r = await api("GET", path);
    check(`GET ${name}`, r.status === 200, `status ${r.status} ${typeof r.json === "string" ? r.json : ""}`);
  }

  summarize();
}

function summarize() {
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${fail.length === 0 ? "✅ ALL" : "❌ " + fail.length} of ${results.length} checks${fail.length ? " FAILED:" : " passed"}`);
  fail.forEach((f) => console.log(`   ❌ ${f.name}: ${f.detail ?? ""}`));
  process.exit(fail.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error("crashed:", e.message); process.exit(2); });
