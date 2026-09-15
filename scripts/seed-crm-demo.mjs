/**
 * Populare CRM cu un istoric REALIST de o lună, pentru un workspace anume.
 *
 * De ce există: un CRM gol nu se poate arăta nimănui și nu se poate testa cu adevărat. Ecranele
 * arată altfel pe 3 leaduri decât pe 60, rapoartele n-au ce agrega, iar segmentarea n-are pe ce
 * lucra. Scriptul ăsta scrie o lună de activitate plauzibilă: firme cu fișă completă, produse cu
 * preț, leaduri pe toate etapele, cronologie (apeluri, e-mailuri, note, schimbări de etapă),
 * taskuri restante/azi/viitoare, etichete și acte (oferte, contracte, acte de primire-predare).
 *
 * Trei reguli pe care le respectă, fiindcă scrie într-o bază REALĂ:
 *
 * 1. **Implicit nu scrie nimic.** Fără `--apply` doar spune ce ar face. Un script de populare
 *    care scrie din greșeală în producție e mai scump decât unul care cere un cuvânt în plus.
 * 2. **Nu șterge și nu suprascrie nimic.** Tot ce face e INSERT, plus o singură mutare
 *    reversibilă (leadurile-gunoi dintr-un import vechi ajung într-o pâlnie de arhivă, ca tabla
 *    de lucru să nu fie îngropată sub ele). Rulat de două ori, sare peste ce a creat deja —
 *    potrivirea se face pe cheile naturale (nume de firmă, nume de produs, nume+telefon de lead),
 *    nu pe un marcaj ascuns în date.
 * 3. **Datele sunt plauzibile, dar firmele sunt fictive.** Nume de SRL care sună a Moldova, nu
 *    denumirile legale ale unor companii reale: un CRM de demonstrație nu are voie să lase în
 *    urmă „dosare" fabricate despre firme care există cu adevărat.
 *
 * Aleatorul e determinist (sămânță fixă): două rulări produc aceleași date, deci ce vezi azi în
 * demonstrație vezi și mâine.
 *
 * Utilizare:
 *   node scripts/seed-crm-demo.mjs --email vlah.business@gmail.com            # dry-run
 *   node scripts/seed-crm-demo.mjs --email vlah.business@gmail.com --apply    # scrie
 *   node scripts/seed-crm-demo.mjs --tenant <uuid> --apply
 *
 * Conexiunea: `DATABASE_URL`/`POSTGRES_URL` din mediu, `--url <conn>`, sau cheile
 * `*_POSTGRES_URL_NON_POOLING` dintr-un `.env.vercel` (`--env-file <cale>`).
 */
import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ─── Argumente ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
const EMAIL = flag("email");
const TENANT = flag("tenant");
const ENV_FILE = flag("env-file") ?? path.join(process.env.HOME ?? "", "vector-learn-landing/.env.vercel");

function connectionString() {
  const direct = flag("url") ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (direct) return direct;
  if (existsSync(ENV_FILE)) {
    const env = Object.fromEntries(
      readFileSync(ENV_FILE, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
        })
    );
    // Preferăm conexiunea NON_POOLING: scriem un lot mare într-o tranzacție, iar pool-ul
    // partajat al Supabase închide tranzacțiile lungi.
    const key =
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL_NON_POOLING")) ??
      Object.keys(env).find((k) => k.endsWith("POSTGRES_URL"));
    if (key) return env[key];
  }
  return null;
}

// ─── Aleator determinist ──────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260915);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

// ─── Timp ─────────────────────────────────────────────────────────────────────

const NOW = new Date();
/** Zilele se numără înapoi de la azi; ora o punem în programul de lucru, nu la 3 dimineața. */
function daysAgo(days, hour = 10, minute = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function daysAhead(days, hour = 10, minute = 0) {
  return daysAgo(-days, hour, minute);
}
/** O oră de lucru plauzibilă: nimeni nu sună clienții la 6 dimineața. */
const workHour = () => between(9, 17);

// ─── Datele ───────────────────────────────────────────────────────────────────

/** Firme FICTIVE, dar cu fișa completă: fără industrie/regiune, segmentarea n-are pe ce lucra. */
const COMPANIES = [
  { name: "Alfa Logistic Group SRL", idno: "1013600012345", industry: "Transport și logistică", region: "Chișinău", companySize: "51-250", website: "alfalogistic.md", phone: "+373 22 84 51 20", email: "office@alfalogistic.md", address: "str. Uzinelor 21, Chișinău", employees: 140 },
  { name: "Nord Agro Invest SRL", idno: "1009600023456", industry: "Agricultură", region: "Nord", companySize: "51-250", website: "nordagro.md", phone: "+373 231 4 22 10", email: "contact@nordagro.md", address: "str. Ștefan cel Mare 4, Bălți", employees: 210 },
  { name: "Medlife Clinic SRL", idno: "1015600034567", industry: "Medical", region: "Chișinău", companySize: "11-50", website: "medlifeclinic.md", phone: "+373 22 27 88 40", email: "receptie@medlifeclinic.md", address: "bd. Dacia 47, Chișinău", employees: 38 },
  { name: "Prime Capital Consult SRL", idno: "1011600045678", industry: "Servicii financiare", region: "Chișinău", companySize: "11-50", website: "primecapital.md", phone: "+373 22 54 33 11", email: "office@primecapital.md", address: "str. Pușkin 16, Chișinău", employees: 26 },
  { name: "Vinaria Codrii de Sud SRL", idno: "1007600056789", industry: "Producție alimentară", region: "Centru", companySize: "51-250", website: "codriidesud.md", phone: "+373 263 2 15 40", email: "export@codriidesud.md", address: "s. Cimișlia, r-nul Cimișlia", employees: 175 },
  { name: "TechBridge Systems SRL", idno: "1017600067890", industry: "IT și software", region: "Chișinău", companySize: "51-250", website: "techbridge.md", phone: "+373 22 99 14 02", email: "hr@techbridge.md", address: "str. Alba Iulia 75, Chișinău", employees: 230 },
  { name: "Casa Mobilei Premium SRL", idno: "1006600078901", industry: "Retail", region: "Chișinău", companySize: "11-50", website: "casamobilei.md", phone: "+373 22 43 76 55", email: "vanzari@casamobilei.md", address: "șos. Munceşti 121, Chișinău", employees: 44 },
  { name: "Termo Confort Instal SRL", idno: "1012600089012", industry: "Construcții", region: "Sud", companySize: "11-50", website: "termoconfort.md", phone: "+373 299 2 44 18", email: "office@termoconfort.md", address: "str. Independenței 9, Cahul", employees: 31 },
  { name: "Global Freight Forwarding SRL", idno: "1014600090123", industry: "Transport și logistică", region: "Chișinău", companySize: "1-10", website: "gff.md", phone: "+373 22 60 12 34", email: "info@gff.md", address: "str. Columna 104, Chișinău", employees: 9 },
  { name: "EduSmart Academy SRL", idno: "1018600101234", industry: "Educație", region: "Chișinău", companySize: "11-50", website: "edusmart.md", phone: "+373 22 31 90 77", email: "office@edusmart.md", address: "str. Mitropolit Dosoftei 118, Chișinău", employees: 22 },
  { name: "Retail Partners Moldova SRL", idno: "1010600112345", industry: "Retail", region: "Chișinău", companySize: "251-500", website: "retailpartners.md", phone: "+373 22 88 40 60", email: "office@retailpartners.md", address: "bd. Ștefan cel Mare 182, Chișinău", employees: 410 },
  { name: "AquaPur Utilities SRL", idno: "1005600123456", industry: "Utilități", region: "Centru", companySize: "51-250", website: "aquapur.md", phone: "+373 235 2 30 90", email: "secretariat@aquapur.md", address: "str. Alexandru cel Bun 12, Orhei", employees: 96 },
];

/** Catalogul real al Vector Academy: training AI B2B/B2C. Prețuri în MDL (moneda CRM-ului). */
const PRODUCTS = [
  { name: "Training AI in-house — 1 zi (grup până la 15)", sku: "AI-INH-1D", category: "Training B2B", unit: "sesiune", listPriceCents: 1600000, vatPercent: 20, description: "O zi de training la sediul clientului, pe fluxurile lui reale. Include analiza a 3 procese și materialele." },
  { name: "Training AI in-house — 2 zile (grup până la 15)", sku: "AI-INH-2D", category: "Training B2B", unit: "sesiune", listPriceCents: 2900000, vatPercent: 20, description: "Varianta extinsă: ziua a doua se lucrează pe cazurile aduse de participanți." },
  { name: "AI pentru HR — curs deschis (1 loc)", sku: "AI-HR-OPEN", category: "Cursuri deschise", unit: "loc", listPriceCents: 120000, vatPercent: 20, description: "Grup de maximum 16 persoane, 4 ore, online." },
  { name: "AI în Finanțe — curs deschis (1 loc)", sku: "AI-FIN-OPEN", category: "Cursuri deschise", unit: "loc", listPriceCents: 130000, vatPercent: 20, description: "Automatizarea raportării și a reconcilierilor, pe fișiere reale." },
  { name: "AI în Marketing — curs deschis (1 loc)", sku: "AI-MKT-OPEN", category: "Cursuri deschise", unit: "loc", listPriceCents: 120000, vatPercent: 20, description: "Conținut, campanii și analiză — de la brief la raport." },
  { name: "Prompt Engineering — atelier practic (1 loc)", sku: "AI-PROMPT", category: "Cursuri deschise", unit: "loc", listPriceCents: 90000, vatPercent: 20, description: "Trei ore, exclusiv exerciții." },
  { name: "Audit de procese pentru automatizare AI", sku: "AI-AUDIT", category: "Consultanță", unit: "proiect", listPriceCents: 2400000, vatPercent: 20, description: "Inventarul proceselor, estimarea economiei de timp și planul de implementare." },
  { name: "Implementare asistent AI intern", sku: "AI-ASSIST", category: "Consultanță", unit: "proiect", listPriceCents: 4800000, vatPercent: 20, description: "Asistent pe documentele companiei, cu drepturi pe roluri." },
  { name: "Abonament suport AI — lunar", sku: "AI-SUP-M", category: "Abonamente", unit: "lună", listPriceCents: 350000, vatPercent: 20, description: "Ore de consultanță la cerere și actualizări de flux." },
  { name: "Sesiune de follow-up (2 ore)", sku: "AI-FUP", category: "Training B2B", unit: "sesiune", listPriceCents: 450000, vatPercent: 20, description: "La 30 de zile după training: ce s-a aplicat, ce s-a blocat." },
];

const FIRST_NAMES = ["Ana", "Mihai", "Elena", "Victor", "Cristina", "Andrei", "Natalia", "Sergiu", "Diana", "Ion", "Marina", "Vadim", "Irina", "Dumitru", "Olga", "Radu", "Svetlana", "Nicolae", "Aliona", "Ruslan", "Tatiana", "Igor"];
const LAST_NAMES = ["Rusu", "Ciobanu", "Popescu", "Cebotari", "Munteanu", "Lungu", "Grosu", "Balan", "Sîrbu", "Gîrlea", "Postolache", "Ursu", "Cojocaru", "Frunze", "Bejan", "Rotaru", "Damian", "Vieru"];
const ROLES = ["Director general", "Director HR", "Director financiar", "Manager operațiuni", "Șef departament IT", "Manager marketing", "Contabil-șef", "Coordonator training"];

const SOURCES = ["webform", "referral", "phone_in", "manual", "instagram", "facebook_ad", "import", "other"];

/** Notele de apel — scrise ca de agent grăbit, nu ca de robot. */
const CALL_NOTES = [
  "Sunat, a răspuns. Are nevoie până la finalul lunii, trimit ofertă.",
  "Nu a răspuns, am lăsat mesaj pe WhatsApp.",
  "Discutat 12 min. Bugetul e aprobat, vrea 2 grupe.",
  "A cerut să revin după ședința de consiliu, joi.",
  "Interesat, dar amână pentru trimestrul următor.",
  "A întrebat dacă putem face trainingul la sediul lor. Da, am confirmat.",
  "Numărul e al recepției — am cerut contactul direct al HR-ului.",
  "Vrea întâi o sesiune scurtă de test cu 5 oameni.",
];
const EMAIL_NOTES = [
  "Trimis oferta cu cele două variante (1 zi / 2 zile).",
  "Trimis agenda detaliată și CV-ul trainerului.",
  "Revenit cu e-mail, fără răspuns de 4 zile.",
  "Trimis factura proformă.",
  "Trimis lista de participanți pentru confirmare.",
];
const MEETING_NOTES = [
  "Întâlnire online 30 min: au 3 procese de automatizat în contabilitate.",
  "Vizită la sediu. Au arătat fluxul de aprobări — durează 4 zile.",
  "Call cu directorul și HR-ul. Vor să înceapă în octombrie.",
];
const LOST_REASONS = ["Preț peste buget", "A ales alt furnizor", "Amânat pentru anul viitor", "Nu a răspuns la 3 încercări", "Nu are nevoie acum"];

const TAGS = ["prioritar", "buget aprobat", "recomandare", "grup mare", "urgent", "sector public", "revenire toamnă"];

// ─── Ajutoare SQL ─────────────────────────────────────────────────────────────

const plan = { created: {}, skipped: {}, notes: [] };
const add = (bucket, key, n = 1) => {
  bucket[key] = (bucket[key] ?? 0) + n;
};

function money(cents) {
  return new Intl.NumberFormat("ro-MD", { style: "currency", currency: "MDL" }).format(cents / 100);
}

// ─── Programul propriu-zis ────────────────────────────────────────────────────

async function main() {
  const conn = connectionString();
  if (!conn) {
    console.error("Nicio conexiune: dă `--url`, `DATABASE_URL` sau un `.env.vercel` cu `--env-file`.");
    process.exit(1);
  }
  const sql = postgres(conn, { ssl: conn.includes("localhost") ? false : "require", max: 1, connect_timeout: 20 });

  try {
    // ── Workspace-ul ──────────────────────────────────────────────────────────
    let tenantId = TENANT;
    let owner = null;
    if (EMAIL) {
      const [u] = await sql`select id, tenant_id, name, email from users where lower(email) = ${EMAIL.toLowerCase()}`;
      if (!u) throw new Error(`Nu există niciun utilizator cu e-mailul ${EMAIL}.`);
      tenantId = u.tenant_id;
      owner = u;
    }
    if (!tenantId) throw new Error("Lipsește `--email` sau `--tenant`.");

    const [tenant] = await sql`select id, name, slug from tenants where id = ${tenantId}`;
    if (!tenant) throw new Error(`Workspace-ul ${tenantId} nu există.`);

    const staff = await sql`
      select id, name, email, role from users
      where tenant_id = ${tenantId} and role not in ('student', 'parent')
      order by case when role = 'admin' then 0 else 1 end, name`;
    const ownerId = owner?.id ?? staff[0]?.id ?? null;
    const agents = staff.length ? staff : [{ id: ownerId, name: "—" }];

    console.log(`\nWorkspace: ${tenant.name} (${tenant.slug})`);
    console.log(`Oameni: ${staff.map((s) => `${s.name} [${s.role}]`).join(", ") || "—"}`);
    console.log(APPLY ? "Mod: SCRIE ÎN BAZĂ (--apply)\n" : "Mod: simulare (fără --apply nu se scrie nimic)\n");

    // ── 1. Pâlnii și etape ────────────────────────────────────────────────────
    const existingPipelines = await sql`select id, name, is_default, order_index from crm_pipelines where tenant_id = ${tenantId} order by order_index`;
    let defaultPipeline = existingPipelines.find((p) => p.is_default) ?? existingPipelines[0] ?? null;

    /** Etapele „de vânzare" — aceleași chei ca implicitele, ca leadurile vechi să nu rămână orfane. */
    const SALES_STAGES = [
      { key: "new", label: "Lead nou", color: "sky", probability: 10, won: false, lost: false },
      { key: "contacted", label: "Contactat", color: "lavender", probability: 25, won: false, lost: false },
      { key: "trial", label: "Ofertă trimisă", color: "peach", probability: 50, won: false, lost: false },
      { key: "negociere", label: "Negociere", color: "peach", probability: 70, won: false, lost: false },
      { key: "paid", label: "Câștigat", color: "mint", probability: 100, won: true, lost: false },
      { key: "lost", label: "Pierdut", color: "rose", probability: 0, won: false, lost: true },
    ];
    const B2C_STAGES = [
      { key: "interes", label: "A cerut detalii", color: "sky", probability: 15, won: false, lost: false },
      { key: "loc_rezervat", label: "Loc rezervat", color: "lavender", probability: 45, won: false, lost: false },
      { key: "confirmat", label: "Confirmat", color: "peach", probability: 75, won: false, lost: false },
      { key: "platit", label: "Plătit", color: "mint", probability: 100, won: true, lost: false },
      { key: "renuntat", label: "Renunțat", color: "rose", probability: 0, won: false, lost: true },
    ];

    async function ensurePipeline(name, orderIndex, stages, { isDefault = false } = {}) {
      let row = existingPipelines.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (!row) {
        add(plan.created, `pâlnia „${name}"`);
        if (APPLY) {
          [row] = await sql`
            insert into crm_pipelines (tenant_id, name, order_index, is_default)
            values (${tenantId}, ${name}, ${orderIndex}, ${isDefault})
            returning id, name, is_default, order_index`;
          existingPipelines.push(row);
        } else {
          row = { id: `(nou:${name})`, name, is_default: isDefault };
        }
      } else {
        add(plan.skipped, `pâlnia „${name}" (există)`);
      }
      // Etapele pâlniei — cheia e unică pe (tenant, pâlnie, key), deci nu se ciocnesc între pâlnii.
      const have = row.id.toString().startsWith("(nou")
        ? []
        : await sql`select key from crm_pipeline_stages where tenant_id = ${tenantId} and pipeline_id = ${row.id}`;
      const haveKeys = new Set(have.map((s) => s.key));
      for (const [i, st] of stages.entries()) {
        if (haveKeys.has(st.key)) continue;
        add(plan.created, `etape în „${name}"`);
        if (APPLY) {
          await sql`
            insert into crm_pipeline_stages
              (tenant_id, pipeline_id, key, label, color, order_index, is_won, is_lost, probability_pct)
            values (${tenantId}, ${row.id}, ${st.key}, ${st.label}, ${st.color}, ${i}, ${st.won}, ${st.lost}, ${st.probability})`;
        }
      }
      return row;
    }

    // Pâlnia implicită există deja (cu cele 5 etape implicite): îi completăm etapele lipsă
    // („Negociere") și o folosim pentru vânzarea B2B.
    if (defaultPipeline) {
      const have = await sql`select key from crm_pipeline_stages where tenant_id = ${tenantId} and (pipeline_id = ${defaultPipeline.id} or pipeline_id is null)`;
      const haveKeys = new Set(have.map((s) => s.key));
      for (const [i, st] of SALES_STAGES.entries()) {
        if (haveKeys.has(st.key)) continue;
        add(plan.created, `etape în „${defaultPipeline.name}"`);
        if (APPLY) {
          await sql`
            insert into crm_pipeline_stages
              (tenant_id, pipeline_id, key, label, color, order_index, is_won, is_lost, probability_pct)
            values (${tenantId}, ${defaultPipeline.id}, ${st.key}, ${st.label}, ${st.color}, ${i}, ${st.won}, ${st.lost}, ${st.probability})`;
        }
      }
    } else {
      defaultPipeline = await ensurePipeline("Vânzări B2B", 0, SALES_STAGES, { isDefault: true });
    }

    const b2cPipeline = await ensurePipeline("Cursuri deschise", 1, B2C_STAGES);
    const archivePipeline = await ensurePipeline("Arhivă import e-mail", 9, [
      { key: "new", label: "Import brut", color: "lavender", probability: 0, won: false, lost: false },
    ]);

    // ── 2. Leadurile-gunoi dintr-un import vechi → în arhivă ───────────────────
    // Sunt rândurile unui jurnal de livrare e-mail importat din greșeală ca leaduri: numele e
    // „Cineva <adresa@...>", iar telefonul e „delivered"/„bounced"/„suppressed". Nu le ștergem
    // (nu ștergem niciodată date), dar nu au ce căuta peste tabla de lucru.
    const junk = await sql`
      select count(*)::int n from leads
      where tenant_id = ${tenantId}
        and (pipeline_id is null or pipeline_id = ${defaultPipeline.id ?? null})
        and (phone in ('delivered', 'bounced', 'suppressed', 'complained', 'opened', 'clicked')
             or full_name ~ '^[^<]+<[^>]+@[^>]+>$')`;
    if (junk[0].n > 0) {
      plan.notes.push(`${junk[0].n} leaduri dintr-un import de jurnal e-mail se mută în pâlnia „Arhivă import e-mail" (reversibil, nimic nu se șterge).`);
      if (APPLY && !archivePipeline.id.toString().startsWith("(nou")) {
        await sql`
          update leads set pipeline_id = ${archivePipeline.id}, updated_at = now()
          where tenant_id = ${tenantId}
            and (pipeline_id is null or pipeline_id = ${defaultPipeline.id ?? null})
            and (phone in ('delivered', 'bounced', 'suppressed', 'complained', 'opened', 'clicked')
                 or full_name ~ '^[^<]+<[^>]+@[^>]+>$')`;
      }
    }

    // ── 3. Produse ────────────────────────────────────────────────────────────
    const productIds = {};
    for (const [i, p] of PRODUCTS.entries()) {
      const [exists] = await sql`select id from crm_products where tenant_id = ${tenantId} and name = ${p.name}`;
      if (exists) {
        productIds[p.sku] = exists.id;
        add(plan.skipped, "produse (există)");
        continue;
      }
      add(plan.created, "produse");
      if (APPLY) {
        const [row] = await sql`
          insert into crm_products (tenant_id, sku, name, category, description, unit, list_price_cents, currency, vat_percent, is_active, order_index)
          values (${tenantId}, ${p.sku}, ${p.name}, ${p.category}, ${p.description}, ${p.unit}, ${p.listPriceCents}, 'MDL', ${String(p.vatPercent)}, true, ${i})
          returning id`;
        productIds[p.sku] = row.id;
      }
    }

    // ── 4. Firme ──────────────────────────────────────────────────────────────
    const companyIds = {};
    for (const c of COMPANIES) {
      const [exists] = await sql`select id from crm_companies where tenant_id = ${tenantId} and name = ${c.name}`;
      if (exists) {
        companyIds[c.name] = exists.id;
        add(plan.skipped, "firme (există)");
        continue;
      }
      add(plan.created, "firme");
      if (APPLY) {
        const created = daysAgo(between(20, 32), workHour());
        const [row] = await sql`
          insert into crm_companies
            (tenant_id, name, name_normalized, idno, industry, region, company_size, website, phone, phone_normalized, email, email_normalized, address, notes, created_at, updated_at)
          values (${tenantId}, ${c.name}, ${c.name.toLowerCase()}, ${c.idno}, ${c.industry}, ${c.region}, ${c.companySize},
                  ${c.website}, ${c.phone}, ${c.phone.replace(/\D/g, "").slice(-8)}, ${c.email}, ${c.email.toLowerCase()},
                  ${c.address}, ${`Aproximativ ${c.employees} angajați.`}, ${created}, ${created})
          returning id`;
        companyIds[c.name] = row.id;
      }
    }

    // ── 5. Leaduri + cronologie + taskuri ─────────────────────────────────────
    /**
     * Forma pâlniei nu e uniformă, fiindcă nici realitatea nu e: mai multe leaduri noi decât
     * câștigate, câteva pierdute cu motiv, iar cele câștigate au istoricul cel mai lung.
     */
    const B2B_PLAN = [
      { stage: "paid", count: 4, ageDays: [26, 32] },
      { stage: "negociere", count: 4, ageDays: [12, 22] },
      { stage: "trial", count: 6, ageDays: [8, 20] },
      { stage: "contacted", count: 7, ageDays: [3, 14] },
      { stage: "new", count: 6, ageDays: [0, 6] },
      { stage: "lost", count: 4, ageDays: [15, 30] },
    ];
    const B2C_PLAN = [
      { stage: "platit", count: 5, ageDays: [18, 30] },
      { stage: "confirmat", count: 4, ageDays: [6, 16] },
      { stage: "loc_rezervat", count: 5, ageDays: [4, 12] },
      { stage: "interes", count: 6, ageDays: [0, 7] },
      { stage: "renuntat", count: 3, ageDays: [10, 25] },
    ];

    const madeLeads = [];
    let companyCursor = 0;

    async function makeLead({ pipeline, stage, ageDays, b2b }) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const fullName = `${first} ${last}`;
      const company = b2b ? COMPANIES[companyCursor++ % COMPANIES.length] : null;
      const phone = `+373 6${between(0, 9)} ${between(100, 999)} ${between(100, 999)}`;
      const email = b2b
        ? `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@${company.website}`
        : `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@gmail.com`;

      const [dup] = await sql`select id from leads where tenant_id = ${tenantId} and full_name = ${fullName} and phone = ${phone}`;
      if (dup) {
        add(plan.skipped, "leaduri (există)");
        return null;
      }

      const created = daysAgo(between(ageDays[0], ageDays[1]), workHour(), pick([0, 15, 30, 45]));
      const product = b2b
        ? pick(PRODUCTS.filter((p) => p.category !== "Cursuri deschise"))
        : pick(PRODUCTS.filter((p) => p.category === "Cursuri deschise"));
      const qty = b2b ? 1 : between(1, 4);
      const value = product.listPriceCents * qty;
      const agent = pick(agents);
      const source = b2b ? pick(["referral", "webform", "phone_in", "manual", "other"]) : pick(["webform", "instagram", "facebook_ad", "referral"]);
      const lostStage = stage === "lost" || stage === "renuntat";

      add(plan.created, b2b ? "leaduri B2B" : "leaduri B2C");
      if (!APPLY) return null;

      const [lead] = await sql`
        insert into leads
          (tenant_id, full_name, full_name_normalized, phone, phone_normalized, email, email_normalized,
           company, company_id, deal_name, interest_course, product_id, stage, pipeline_id, source,
           assigned_to, value_cents, probability_pct, lost_reason, notes, consent_at, created_at, updated_at)
        values (${tenantId}, ${fullName}, ${fullName.toLowerCase()}, ${phone}, ${phone.replace(/\D/g, "").slice(-8)},
                ${email}, ${email.toLowerCase()}, ${company?.name ?? null}, ${company ? companyIds[company.name] ?? null : null},
                ${b2b ? `${company.name} — ${product.name.split("—")[0].trim()}` : null},
                ${product.name}, ${productIds[product.sku] ?? null}, ${stage}, ${pipeline.id}, ${source},
                ${agent.id}, ${value}, ${null}, ${lostStage ? pick(LOST_REASONS) : null},
                ${b2b ? `${pick(ROLES)} la ${company.name}.` : "Înscriere din formularul de pe site."},
                ${source === "webform" ? created : null}, ${created}, ${created})
        returning id, full_name, stage, value_cents, created_at`;

      // Cronologia: prima notă la creare, apoi 1–5 atingeri până azi, în ordine.
      const events = [];
      events.push({ type: "note", direction: "internal", body: b2b ? "Lead nou din site. De sunat." : "Înscriere nouă la curs.", at: created, meta: null });

      const touches = lostStage ? between(3, 5) : Math.min(between(1, 5), Math.max(1, Math.round((NOW - created) / (1000 * 60 * 60 * 24 * 3))));
      let cursor = new Date(created);
      for (let i = 0; i < touches; i++) {
        cursor = new Date(cursor.getTime() + between(1, 4) * 24 * 3600 * 1000);
        if (cursor > NOW) break;
        cursor.setHours(workHour(), pick([0, 10, 20, 30, 40, 50]), 0, 0);
        const kind = pick(["call", "email", "call", "note", "meeting", "whatsapp"]);
        if (kind === "call") {
          events.push({
            type: "call", direction: "outbound", body: pick(CALL_NOTES), at: new Date(cursor),
            meta: { outcome: pick(["interested", "no-answer", "callback", "not-interested"]), duration_seconds: between(45, 900) },
          });
        } else if (kind === "email") {
          events.push({ type: "email", direction: "outbound", body: pick(EMAIL_NOTES), at: new Date(cursor), meta: { subject: "Vector Academy — ofertă training AI" } });
        } else if (kind === "meeting") {
          events.push({ type: "meeting", direction: "internal", body: pick(MEETING_NOTES), at: new Date(cursor), meta: null });
        } else if (kind === "whatsapp") {
          events.push({ type: "whatsapp", direction: "outbound", body: "Trimis mesaj cu detaliile grupei.", at: new Date(cursor), meta: null });
        } else {
          events.push({ type: "note", direction: "internal", body: pick(["De revenit săptămâna viitoare.", "A cerut factură pe firmă.", "Decizia se ia în ședința de luni."]), at: new Date(cursor), meta: null });
        }
      }

      // Traseul prin etape: fiecare lead trece prin etapele dinaintea celei curente.
      const order = (pipeline.id === b2cPipeline.id ? B2C_STAGES : SALES_STAGES).map((s) => s.key);
      const targetIdx = order.indexOf(stage);
      if (targetIdx > 0) {
        let from = order[0];
        const span = Math.max(1, Math.floor((NOW - created) / (1000 * 3600 * 24)) - 1);
        for (let i = 1; i <= targetIdx; i++) {
          const to = order[i];
          const at = new Date(created.getTime() + Math.round((span * i) / (targetIdx + 1)) * 24 * 3600 * 1000);
          if (at > NOW) break;
          at.setHours(workHour(), 0, 0, 0);
          events.push({ type: "stage_change", direction: "internal", body: `${from} → ${to}`, at, meta: { from, to } });
          from = to;
        }
      }

      events.sort((a, b) => a.at - b.at);
      for (const e of events) {
        await sql`
          insert into lead_interactions (tenant_id, lead_id, type, direction, body, metadata, user_id, occurred_at)
          values (${tenantId}, ${lead.id}, ${e.type}, ${e.direction}, ${e.body}, ${e.meta ? JSON.stringify(e.meta) : null}, ${agent.id}, ${e.at})`;
        add(plan.created, "intrări în cronologie");
      }

      // Etichete: nu toate leadurile au, ca filtrul pe etichetă să însemne ceva.
      if (rnd() < 0.45) {
        const tag = pick(TAGS);
        await sql`insert into lead_tags (tenant_id, lead_id, tag, created_at) values (${tenantId}, ${lead.id}, ${tag}, ${created})`;
        add(plan.created, "etichete");
      }

      madeLeads.push({ ...lead, agentId: agent.id, company, product, qty, stage, b2b });
      return lead;
    }

    for (const group of B2B_PLAN) {
      for (let i = 0; i < group.count; i++) {
        await makeLead({ pipeline: defaultPipeline, stage: group.stage, ageDays: group.ageDays, b2b: true });
      }
    }
    for (const group of B2C_PLAN) {
      for (let i = 0; i < group.count; i++) {
        await makeLead({ pipeline: b2cPipeline, stage: group.stage, ageDays: group.ageDays, b2b: false });
      }
    }

    // ── 6. Taskuri: restante, azi, mâine, viitoare, finalizate ────────────────
    const TASK_TITLES = ["Sună clientul", "Trimite oferta", "Revino cu follow-up", "Confirmă lista de participanți", "Pregătește agenda trainingului", "Trimite factura proformă", "Programează întâlnirea"];
    if (APPLY && madeLeads.length) {
      const open = madeLeads.filter((l) => !["lost", "renuntat", "paid", "platit"].includes(l.stage));
      const buckets = [
        { n: 5, due: () => daysAgo(between(1, 6), workHour()), done: false },   // restante
        { n: 4, due: () => daysAgo(0, between(9, 17)), done: false },            // azi
        { n: 4, due: () => daysAhead(1, between(9, 17)), done: false },          // mâine
        { n: 7, due: () => daysAhead(between(2, 12), workHour()), done: false }, // viitoare
        { n: 9, due: () => daysAgo(between(2, 20), workHour()), done: true },    // finalizate
      ];
      let idx = 0;
      for (const b of buckets) {
        for (let i = 0; i < b.n && open.length; i++) {
          const lead = open[idx++ % open.length];
          const due = b.due();
          await sql`
            insert into crm_lead_tasks (tenant_id, lead_id, title, due_at, status, assigned_to, completed_at, created_by, created_at, updated_at)
            values (${tenantId}, ${lead.id}, ${pick(TASK_TITLES)}, ${due}, ${b.done ? "done" : "open"}, ${lead.agentId},
                    ${b.done ? new Date(due.getTime() + 3600 * 1000) : null}, ${ownerId}, ${lead.created_at}, ${lead.created_at})`;
          add(plan.created, b.done ? "taskuri finalizate" : "taskuri deschise");
        }
      }
    } else if (!APPLY) {
      add(plan.created, "taskuri deschise", 20);
      add(plan.created, "taskuri finalizate", 9);
    }

    // ── 7. Motive de pierdere configurate ─────────────────────────────────────
    for (const [i, reason] of LOST_REASONS.entries()) {
      const [exists] = await sql`select id from crm_lost_reasons where tenant_id = ${tenantId} and label = ${reason}`;
      if (exists) continue;
      add(plan.created, "motive de pierdere");
      if (APPLY) {
        await sql`insert into crm_lost_reasons (tenant_id, label, order_index) values (${tenantId}, ${reason}, ${i})`;
      }
    }

    // ── 8. Acte: oferte, contracte, acte de primire-predare ───────────────────
    // Se leagă de lead prin `counterparty_kind = 'crm_lead'` — exact cum le citește
    // `/api/crm/documents` (vezi server/routes/crmDocuments.ts).
    if (APPLY && madeLeads.length) {
      const templates = await sql`select id, name, kind from docmerge_templates where tenant_id = ${tenantId} and is_system = true`;
      const tpl = (kind) => templates.find((t) => t.kind === kind)?.id ?? null;
      const [payer] = await sql`select id, name from par_payers where tenant_id = ${tenantId} order by created_at limit 1`;

      const year = NOW.getFullYear();
      let seqOffer = 0;
      let seqContract = 0;
      let seqAct = 0;

      /** Actele merg pe leadurile avansate: nimeni nu face contract pentru un lead necontactat. */
      const won = madeLeads.filter((l) => ["paid", "platit"].includes(l.stage));
      const negotiating = madeLeads.filter((l) => ["negociere", "trial", "confirmat"].includes(l.stage));

      async function makeDoc({ lead, kind, templateKind, title, status, daysBack, numberPrefix, seq }) {
        const docDate = daysAgo(daysBack, workHour());
        const unitPrice = lead.product.listPriceCents;
        const total = unitPrice * lead.qty;
        const snapshot = lead.company
          ? { denumire: lead.company.name, idno: lead.company.idno, adresa: lead.company.address, email: lead.company.email, telefon: lead.company.phone }
          : { denumire: lead.full_name };
        const isFinal = status !== "draft";
        const [doc] = await sql`
          insert into doc_documents
            (tenant_id, template_id, template_version, kind, doc_number, doc_year, doc_date, title, status,
             sent_at, outcome_at, payer_id, counterparty_kind, counterparty_id, counterparty_name,
             counterparty_snapshot, context, body_html, total_cents, currency, created_by_user_id,
             finalized_at, created_at, updated_at)
          values (${tenantId}, ${tpl(templateKind)}, 1, ${kind},
                  ${isFinal ? `${numberPrefix}-${String(seq).padStart(3, "0")}` : null}, ${isFinal ? year : null},
                  ${docDate}, ${title}, ${status},
                  ${["sent", "signed", "rejected"].includes(status) ? new Date(docDate.getTime() + 2 * 3600 * 1000) : null},
                  ${["signed", "rejected"].includes(status) ? daysAgo(Math.max(0, daysBack - between(1, 4)), workHour()) : null},
                  ${payer?.id ?? null}, 'crm_lead', ${lead.id}, ${lead.company?.name ?? lead.full_name},
                  ${JSON.stringify(snapshot)}, ${JSON.stringify({ baza: "oferta acceptată", loc: "Chișinău" })},
                  ${`<h1>${title}</h1><p>Document generat pentru ${lead.company?.name ?? lead.full_name}.</p>`},
                  ${total}, 'MDL', ${ownerId}, ${isFinal ? docDate : null}, ${docDate}, ${docDate})
          returning id`;
        await sql`
          insert into doc_document_lines (tenant_id, document_id, position, description, unit, quantity, unit_price_cents, line_total_cents, vat_percent, created_at)
          values (${tenantId}, ${doc.id}, 1, ${lead.product.name}, ${lead.product.unit}, ${lead.qty}, ${unitPrice}, ${total}, 20, ${docDate})`;
        add(plan.created, `acte (${kind})`);
        return doc;
      }

      // 4 oferte pe leaduri în negociere/ofertă trimisă
      for (const lead of negotiating.slice(0, 4)) {
        await makeDoc({ lead, kind: "oferta_comerciala", templateKind: "oferta_comerciala", title: `Ofertă comercială — ${lead.product.name}`, status: "sent", daysBack: between(4, 14), numberPrefix: "OF", seq: ++seqOffer });
      }
      // 4 contracte pe leadurile câștigate
      for (const lead of won.slice(0, 4)) {
        await makeDoc({ lead, kind: "contract_servicii", templateKind: "contract_servicii", title: `Contract de prestări servicii — ${lead.company?.name ?? lead.full_name}`, status: "signed", daysBack: between(12, 24), numberPrefix: "CT", seq: ++seqContract });
      }
      // 4 acte de primire-predare pentru serviciile deja livrate
      for (const lead of won.slice(0, 4)) {
        await makeDoc({ lead, kind: "act_primire_predare", templateKind: "act_primire_predare", title: `Act de primire-predare — ${lead.product.name}`, status: "signed", daysBack: between(2, 10), numberPrefix: "AP", seq: ++seqAct });
      }
      // + una în lucru și una refuzată, ca lista să nu fie uniform „semnat"
      if (negotiating[4]) {
        await makeDoc({ lead: negotiating[4], kind: "oferta_comerciala", templateKind: "oferta_comerciala", title: `Ofertă comercială — ${negotiating[4].product.name}`, status: "draft", daysBack: 1, numberPrefix: "OF", seq: ++seqOffer });
      }
      if (negotiating[5]) {
        await makeDoc({ lead: negotiating[5], kind: "oferta_comerciala", templateKind: "oferta_comerciala", title: `Ofertă comercială — ${negotiating[5].product.name}`, status: "rejected", daysBack: between(6, 12), numberPrefix: "OF", seq: ++seqOffer });
      }
    } else if (!APPLY) {
      add(plan.created, "acte (oferte / contracte / acte de primire)", 14);
    }

    // ── Raport ────────────────────────────────────────────────────────────────
    console.log("─".repeat(64));
    console.log(APPLY ? "SCRIS:" : "S-AR SCRIE:");
    for (const [k, v] of Object.entries(plan.created)) console.log(`  + ${String(v).padStart(4)}  ${k}`);
    if (Object.keys(plan.skipped).length) {
      console.log("SĂRIT (există deja):");
      for (const [k, v] of Object.entries(plan.skipped)) console.log(`  = ${String(v).padStart(4)}  ${k}`);
    }
    for (const n of plan.notes) console.log(`  ! ${n}`);

    if (APPLY) {
      const totals = await sql`
        select 'leaduri' k, count(*)::int n from leads where tenant_id = ${tenantId}
        union all select 'cronologie', count(*)::int from lead_interactions where tenant_id = ${tenantId}
        union all select 'firme', count(*)::int from crm_companies where tenant_id = ${tenantId}
        union all select 'produse', count(*)::int from crm_products where tenant_id = ${tenantId}
        union all select 'taskuri', count(*)::int from crm_lead_tasks where tenant_id = ${tenantId}
        union all select 'acte', count(*)::int from doc_documents where tenant_id = ${tenantId}`;
      console.log("─".repeat(64));
      console.log("TOTAL ÎN WORKSPACE ACUM:");
      for (const t of totals) console.log(`  ${String(t.n).padStart(5)}  ${t.k}`);
      const [pipelineValue] = await sql`
        select coalesce(sum(value_cents), 0)::bigint v from leads
        where tenant_id = ${tenantId} and pipeline_id = ${defaultPipeline.id}`;
      console.log(`  valoare pâlnie B2B: ${money(Number(pipelineValue.v))}`);
    }
    console.log("");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\nEȘEC:", err.message);
  process.exit(1);
});
