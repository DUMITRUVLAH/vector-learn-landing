/**
 * Populare pentru TESTAREA stratului de call-center B2B (CC-1…CC-7).
 *
 * Scenariul, exact cum l-a cerut ownerul: el rămâne managerul, echipa are doi agenți de vânzări,
 * iar baza are **50 de contacte nerepartizate** (rezerva rece) plus **25 + 25** repartizate celor
 * doi, împrăștiate pe etape.
 *
 * De ce un script separat de `seed-crm-demo.mjs`, deși acela populează tot CRM-ul: acela scrie o
 * lună de activitate „de arătat" pe pâlniile existente. Ăsta scrie o situație PRECISĂ, cu numere
 * pe care le verifici cu ochiul („trebuie să fie 50 în rezervă"), pe o pâlnie de call-center, cu
 * exact lucrurile care nu existau până acum: rezultate de apel, contor de încercări, coloane
 * importate (cod CAEN, etichete), `assigned_at` pentru regula de întoarcere în rezervă, norme KPI.
 * Amestecate, cele două seturi de date ar face imposibilă verificarea oricărui număr.
 *
 * Aceleași trei reguli ca la celălalt script, fiindcă scrie într-o bază REALĂ:
 *  1. **Implicit nu scrie nimic.** Fără `--apply` doar spune ce ar face.
 *  2. **Nu șterge și nu suprascrie nimic.** Doar INSERT. A doua rulare sare peste ce a creat deja
 *     (potrivire pe chei naturale: e-mailul agentului, numele pâlniei, numele+telefonul leadului).
 *  3. **Firmele sunt fictive.** Nume de SRL care sună a Moldova, coduri fiscale inventate cu un
 *     prefix care NU e alocat în registrul real — un cont de test nu lasă în urmă „dosare" despre
 *     firme care există.
 *
 * Aleatorul e determinist: două rulări produc aceleași date.
 *
 * Utilizare:
 *   node scripts/seed-crm-callcenter.mjs --email vlah.business@gmail.com           # simulare
 *   node scripts/seed-crm-callcenter.mjs --email vlah.business@gmail.com --apply   # scrie
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
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
/** Parola celor doi agenți creați. Se poate schimba din linia de comandă. */
const PASSWORD = flag("password") ?? "Vanzari2026!";
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
const rnd = mulberry32(20260920);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const NOW = new Date();
function daysAgo(days, hour = 10, minute = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const workHour = () => between(9, 17);

// ─── Cei doi agenți ───────────────────────────────────────────────────────────

/**
 * Adresele sunt pe `.demo.io` INTENȚIONAT: `server/lib/emailGuard.ts` blochează necondiționat
 * orice e-mail către domeniul ăsta, deci un test nu poate trimite din greșeală nimic unei
 * persoane reale. Conturile se pot folosi la login exact ca oricare altele.
 */
const AGENTS = [
  { email: "ana.rusu@vector.demo.io", name: "Ana Rusu", role: "manager" },
  { email: "bogdan.croitoru@vector.demo.io", name: "Bogdan Croitoru", role: "manager" },
];

// ─── Pâlnia de call-center (aceleași chei ca șablonul din server/lib/crm/stages.ts) ──

const STAGES = [
  { key: "rezerva", label: "Rezervă rece", color: "sky", probability: 2, won: false, lost: false },
  { key: "repartizat", label: "Repartizat", color: "sky", probability: 5, won: false, lost: false },
  { key: "in_lucru", label: "Apel în lucru", color: "lavender", probability: 15, won: false, lost: false },
  { key: "decident", label: "Decident atins", color: "lavender", probability: 30, won: false, lost: false },
  { key: "oferta", label: "Ofertă trimisă", color: "peach", probability: 55, won: false, lost: false },
  { key: "negociere", label: "Negociere", color: "peach", probability: 75, won: false, lost: false },
  { key: "contract", label: "Contract", color: "mint", probability: 100, won: true, lost: false },
  { key: "pierdut", label: "Pierdut", color: "rose", probability: 0, won: false, lost: true },
];

const PIPELINE_NAME = "Call-center B2B";

/**
 * A doua pâlnie: SPANCO, cu etapele ÎN ENGLEZĂ — acronimul e englezesc, iar „Analiză" ar rupe
 * legătura cu litera A din metodă. Primește un lot mai mic, dar cu aceeași structură, ca ecranele
 * să poată fi comparate pe două procese diferite (call-center vs. vânzare consultativă).
 */
const SPANCO_PIPELINE_NAME = "SPANCO";
const SPANCO_STAGES = [
  { key: "suspect", label: "Suspect", color: "sky", probability: 5, won: false, lost: false },
  { key: "prospect", label: "Prospect", color: "sky", probability: 15, won: false, lost: false },
  { key: "analysis", label: "Analysis", color: "lavender", probability: 35, won: false, lost: false },
  { key: "negotiation", label: "Negotiation", color: "peach", probability: 60, won: false, lost: false },
  { key: "conclusion", label: "Conclusion", color: "peach", probability: 85, won: false, lost: false },
  { key: "order", label: "Order", color: "mint", probability: 100, won: true, lost: false },
  { key: "lost", label: "Lost", color: "rose", probability: 0, won: false, lost: true },
];

/** Lotul SPANCO: 12 în rezervă (Suspect, nerepartizate) + 9 + 9. */
const SPANCO_RESERVE = 12;
const SPANCO_ANA = [
  ["prospect", 3],
  ["analysis", 2],
  ["negotiation", 2],
  ["conclusion", 1],
  ["order", 1],
];
const SPANCO_BOGDAN = [
  ["prospect", 2],
  ["analysis", 3],
  ["negotiation", 2],
  ["order", 1],
  ["lost", 1],
];

// ─── Firme fictive, generate determinist ──────────────────────────────────────

const PREFIX = ["Alfa", "Nord", "Sud", "Vest", "Prime", "Crystal", "Vector", "Magna", "Terra", "Aqua", "Lider", "Forte", "Stil", "Rapid", "Optim", "Unic", "Codru", "Plai", "Luceafăr", "Steaua"];
const CORE = ["Trans", "Agro", "Construct", "Textil", "Food", "Med", "Tech", "Print", "Auto", "Mobil", "Farm", "Lact", "Plast", "Metal", "Garden", "Expert", "Consult", "Service", "Group", "Invest"];
const SUFFIX = ["SRL", "SRL", "SRL", "SA", "SRL"];

const INDUSTRIES = [
  { name: "Transport și logistică", caen: "4941" },
  { name: "Agricultură", caen: "0111" },
  { name: "Construcții", caen: "4120" },
  { name: "Producție alimentară", caen: "1089" },
  { name: "Retail", caen: "4711" },
  { name: "IT și software", caen: "6201" },
  { name: "Medical", caen: "8622" },
  { name: "Servicii financiare", caen: "6920" },
  { name: "HoReCa", caen: "5610" },
  { name: "Producție industrială", caen: "2511" },
];
const REGIONS = ["Chișinău", "Nord", "Centru", "Sud", "UTA Găgăuzia"];
const SIZES = ["1-10", "11-50", "51-250", "251-500"];
const LIST_SOURCES = ["Listă Cameră de Comerț", "Expoziție MoldConstruct", "Bază achiziționată 2026", "Registru online"];
const CONTACT_FIRST = ["Andrei", "Maria", "Ion", "Elena", "Victor", "Natalia", "Sergiu", "Cristina", "Pavel", "Diana", "Mihai", "Olga"];
const CONTACT_LAST = ["Popescu", "Ciobanu", "Rusu", "Munteanu", "Lungu", "Cebotari", "Grosu", "Balan", "Sîrbu", "Moraru", "Guțu", "Vieru"];
const ROLES = ["director general", "director comercial", "manager achiziții", "administrator", "șef departament"];

/** Cod fiscal fictiv: prefixul „9" nu e folosit în IDNO-urile reale din RM. */
const fakeIdno = (i) => `9${String(100600000000 + i * 7919).padStart(12, "0")}`.slice(0, 13);

function makeCompanies(count) {
  const seen = new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const name = `${pick(PREFIX)} ${pick(CORE)} ${pick(SUFFIX)}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const industry = pick(INDUSTRIES);
    const i = out.length;
    out.push({
      name,
      idno: fakeIdno(i + 1),
      industry: industry.name,
      caen: industry.caen,
      region: pick(REGIONS),
      companySize: pick(SIZES),
      phone: `+373 ${between(22, 79)} ${between(10, 99)} ${between(10, 99)} ${between(10, 99)}`,
      email: `office@${name.split(" ")[0].toLowerCase()}${i}.md`,
      listSource: pick(LIST_SOURCES),
      contact: `${pick(CONTACT_FIRST)} ${pick(CONTACT_LAST)}`,
      role: pick(ROLES),
    });
  }
  return out;
}

/**
 * Cum se împart cele 25 de contacte ale fiecărui agent pe etape. Nu e o repartiție frumoasă, ci
 * una REALISTĂ: majoritatea stau în primele etape, puține ajung la contract. O pâlnie în care
 * fiecare etapă are același număr n-ar arăta niciodată unde se pierd afacerile.
 */
const ANA_MIX = [
  ["repartizat", 7],
  ["in_lucru", 6],
  ["decident", 4],
  ["oferta", 3],
  ["negociere", 2],
  ["contract", 2],
  ["pierdut", 1],
];
const BOGDAN_MIX = [
  ["repartizat", 5],
  ["in_lucru", 7],
  ["decident", 5],
  ["oferta", 3],
  ["negociere", 2],
  ["contract", 1],
  ["pierdut", 2],
];

/** Rezultatele plauzibile pentru un apel, pe etapa la care a ajuns leadul. */
const OUTCOMES_BY_STAGE = {
  repartizat: ["no_answer", "busy"],
  in_lucru: ["no_answer", "gatekeeper", "callback", "busy"],
  decident: ["answered", "gatekeeper"],
  oferta: ["answered"],
  negociere: ["answered"],
  contract: ["answered"],
  pierdut: ["not_interested", "refused", "answered"],
};
const TERMINAL = new Set(["wrong_number", "refused"]);

/** Aceeași idee, pe etapele SPANCO: unde a ajuns leadul explică ce s-a întâmplat la telefon. */
const SPANCO_OUTCOMES = {
  suspect: ["no_answer"],
  prospect: ["no_answer", "gatekeeper", "callback"],
  analysis: ["answered", "gatekeeper"],
  negotiation: ["answered"],
  conclusion: ["answered"],
  order: ["answered"],
  lost: ["not_interested", "refused"],
};

const TAGS = ["listă achiziționată", "prioritar", "buget aprobat", "revenire toamnă", "sector public", "grup mare"];

// ─── Raport ───────────────────────────────────────────────────────────────────

const plan = { created: {}, skipped: {}, notes: [] };
const add = (bucket, key, n = 1) => {
  bucket[key] = (bucket[key] ?? 0) + n;
};

// ─── Programul ────────────────────────────────────────────────────────────────

async function main() {
  const conn = connectionString();
  if (!conn) {
    console.error("Nicio conexiune: dă `--url`, `DATABASE_URL` sau un `.env.vercel` cu `--env-file`.");
    process.exit(1);
  }
  const sql = postgres(conn, { ssl: conn.includes("localhost") ? false : "require", max: 1, connect_timeout: 20 });

  try {
    // ── Workspace ────────────────────────────────────────────────────────────
    let tenantId = TENANT;
    let owner = null;
    if (EMAIL) {
      const [u] = await sql`select id, tenant_id, name, email, role from users where lower(email) = ${EMAIL.toLowerCase()}`;
      if (!u) throw new Error(`Nu există niciun utilizator cu e-mailul ${EMAIL}.`);
      tenantId = u.tenant_id;
      owner = u;
    }
    if (!tenantId) throw new Error("Lipsește `--email` sau `--tenant`.");
    const [tenant] = await sql`select id, name, slug from tenants where id = ${tenantId}`;
    if (!tenant) throw new Error(`Workspace-ul ${tenantId} nu există.`);

    console.log(`\nWorkspace: ${tenant.name} (${tenant.slug})`);
    console.log(`Manager: ${owner ? `${owner.name} <${owner.email}> [${owner.role}]` : "—"}`);
    console.log(APPLY ? "Mod: SCRIE ÎN BAZĂ (--apply)\n" : "Mod: simulare (fără --apply nu se scrie nimic)\n");

    // ── 1. Cei doi agenți ────────────────────────────────────────────────────
    const agentIds = {};
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    for (const agent of AGENTS) {
      const [existing] = await sql`select id, name, role from users where lower(email) = ${agent.email}`;
      if (existing) {
        agentIds[agent.email] = existing.id;
        add(plan.skipped, "agenți");
        continue;
      }
      add(plan.created, "agenți");
      if (!APPLY) {
        agentIds[agent.email] = `(nou) ${agent.name}`;
        continue;
      }
      const [row] = await sql`
        insert into users (tenant_id, email, password_hash, name, role, created_at, updated_at)
        values (${tenantId}, ${agent.email}, ${passwordHash}, ${agent.name}, ${agent.role}, ${daysAgo(45)}, ${NOW})
        returning id`;
      agentIds[agent.email] = row.id;
    }

    // ── 2–4. Cele două pâlnii, fiecare cu lotul ei ───────────────────────────
    // ── 3. Câmpurile personalizate (coloanele „importate") ───────────────────
    const FIELDS = [
      { key: "cod_caen", label: "Cod CAEN" },
      { key: "sursa_listei", label: "Sursa listei" },
    ];
    const fieldIds = {};
    for (const field of FIELDS) {
      const [existing] = await sql`
        select id from custom_fields where tenant_id = ${tenantId} and key = ${field.key}`;
      if (existing) {
        fieldIds[field.key] = existing.id;
        add(plan.skipped, "câmpuri personalizate");
        continue;
      }
      add(plan.created, "câmpuri personalizate");
      if (!APPLY) continue;
      const [row] = await sql`
        insert into custom_fields (tenant_id, key, label, type, order_index, created_at, updated_at)
        values (${tenantId}, ${field.key}, ${field.label}, 'text', 0, ${NOW}, ${NOW})
        returning id`;
      fieldIds[field.key] = row.id;
    }

    /**
     * Două procese comerciale diferite, ca ecranele să poată fi comparate pe amândouă:
     * call-centerul (multe contacte, multe apeluri) și SPANCO (lot mic, vânzare consultativă).
     * Etapele SPANCO sunt în engleză — acronimul e englezesc.
     */
    const PROGRAMS = [
      {
        pipelineName: PIPELINE_NAME,
        stages: STAGES,
        staleStage: "repartizat",
        outcomes: OUTCOMES_BY_STAGE,
        assignments: [
          { agent: null, stages: [["rezerva", 50]] },
          { agent: AGENTS[0].email, stages: ANA_MIX },
          { agent: AGENTS[1].email, stages: BOGDAN_MIX },
        ],
      },
      {
        pipelineName: SPANCO_PIPELINE_NAME,
        stages: SPANCO_STAGES,
        staleStage: "prospect",
        outcomes: SPANCO_OUTCOMES,
        assignments: [
          { agent: null, stages: [["suspect", SPANCO_RESERVE]] },
          { agent: AGENTS[0].email, stages: SPANCO_ANA },
          { agent: AGENTS[1].email, stages: SPANCO_BOGDAN },
        ],
      },
    ];

    for (const program of PROGRAMS) {
    // ── 2. Pâlnia de call-center ─────────────────────────────────────────────
    let [pipeline] = await sql`
      select id, name from crm_pipelines where tenant_id = ${tenantId} and name = ${program.pipelineName}`;
    if (pipeline) {
      add(plan.skipped, "pâlnie");
    } else {
      add(plan.created, "pâlnie");
      if (APPLY) {
        const [maxRow] = await sql`select coalesce(max(order_index), -1) as m from crm_pipelines where tenant_id = ${tenantId}`;
        const [row] = await sql`
          insert into crm_pipelines (tenant_id, name, order_index, is_default, created_at, updated_at)
          values (${tenantId}, ${program.pipelineName}, ${Number(maxRow.m) + 1}, false, ${NOW}, ${NOW})
          returning id, name`;
        pipeline = row;
      } else {
        pipeline = { id: "(nou)", name: program.pipelineName };
      }
    }

    if (APPLY && pipeline.id !== "(nou)") {
      for (const [i, stage] of program.stages.entries()) {
        const [has] = await sql`
          select id from crm_pipeline_stages
          where tenant_id = ${tenantId} and pipeline_id = ${pipeline.id} and key = ${stage.key}`;
        if (has) {
          add(plan.skipped, "etape");
          continue;
        }
        add(plan.created, "etape");
        await sql`
          insert into crm_pipeline_stages
            (tenant_id, pipeline_id, key, label, color, order_index, is_won, is_lost, is_default, probability_pct, created_at, updated_at)
          values (${tenantId}, ${pipeline.id}, ${stage.key}, ${stage.label}, ${stage.color}, ${i},
                  ${stage.won}, ${stage.lost}, false, ${stage.probability}, ${NOW}, ${NOW})`;
      }
    } else if (!APPLY) {
      add(plan.created, "etape", program.stages.length);
    }

    // Contactele pâlniei. Repartiția e explicită: numerele se verifică cu ochiul pe ecran.
    const assignments = program.assignments;
    const total = assignments.reduce((sum, a) => sum + a.stages.reduce((s, [, n]) => s + n, 0), 0);
    const companies = makeCompanies(total);

    let cursor = 0;
    for (const bucket of assignments) {
      const assignedTo = bucket.agent ? agentIds[bucket.agent] : null;
      for (const [stageKey, count] of bucket.stages) {
        for (let i = 0; i < count; i++) {
          const company = companies[cursor++];
          const phone = company.phone;
          const fullName = company.contact;
          const dealName = `${company.name} — training AI in-house`;

          const [existingLead] = await sql`
            select id from leads
            where tenant_id = ${tenantId} and company = ${company.name} and phone = ${phone} limit 1`;
          if (existingLead) {
            add(plan.skipped, "contacte");
            continue;
          }
          add(plan.created, `contacte · ${stageKey}`);
          if (!APPLY || pipeline.id === "(nou)") continue;

          // Firma: fișa pe care se sprijină segmentarea și rechizitele actelor.
          let [companyRow] = await sql`
            select id from crm_companies where tenant_id = ${tenantId} and idno = ${company.idno}`;
          if (!companyRow) {
            [companyRow] = await sql`
              insert into crm_companies
                (tenant_id, name, name_normalized, idno, industry, region, company_size, phone, phone_normalized, email, email_normalized, created_at, updated_at)
              values (${tenantId}, ${company.name}, ${company.name.toLowerCase()}, ${company.idno},
                      ${company.industry}, ${company.region}, ${company.companySize},
                      ${phone}, ${phone.replace(/\D/g, "").slice(-8)}, ${company.email}, ${company.email},
                      ${daysAgo(40)}, ${NOW})
              returning id`;
            add(plan.created, "firme");
          }

          // Cât de demult a fost repartizat. Pentru câteva din „repartizat" punem o dată VECHE și
          // nicio activitate — exact cazul pe care îl prinde regula de întoarcere în rezervă.
          const staleOne = assignedTo && stageKey === program.staleStage && i < 2;
          const assignedDaysAgo = staleOne ? between(21, 30) : between(2, 16);
          const createdAt = daysAgo(assignedDaysAgo + between(1, 10), workHour());
          const assignedAt = assignedTo ? daysAgo(assignedDaysAgo, workHour()) : null;

          const value = between(12, 90) * 1000 * 100; // 12.000–90.000 MDL, în cenți
          const stageIndex = program.stages.findIndex((s) => s.key === stageKey);

          const [lead] = await sql`
            insert into leads
              (tenant_id, full_name, full_name_normalized, phone, phone_normalized, email, email_normalized,
               company, company_id, deal_name, stage, pipeline_id, source, assigned_to, assigned_at,
               value_cents, notes, created_at, updated_at)
            values (${tenantId}, ${fullName}, ${fullName.toLowerCase()}, ${phone}, ${phone.replace(/\D/g, "").slice(-8)},
                    ${company.email}, ${company.email}, ${company.name}, ${companyRow.id}, ${dealName},
                    ${stageKey}, ${pipeline.id}, 'import', ${assignedTo}, ${assignedAt},
                    ${value}, ${`${fullName}, ${company.role}. Sursa: ${company.listSource}.`},
                    ${createdAt}, ${NOW})
            returning id`;

          // Coloanele „importate": exact ce se poate filtra în listă, în repartizare și în pâlnie.
          for (const [key, val] of [
            ["cod_caen", company.caen],
            ["sursa_listei", company.listSource],
          ]) {
            if (!fieldIds[key]) continue;
            await sql`
              insert into lead_field_values (tenant_id, lead_id, field_id, value, created_at, updated_at)
              values (${tenantId}, ${lead.id}, ${fieldIds[key]}, ${val}, ${createdAt}, ${NOW})`;
          }
          if (rnd() < 0.35) {
            await sql`
              insert into lead_tags (tenant_id, lead_id, tag, created_at)
              values (${tenantId}, ${lead.id}, ${pick(TAGS)}, ${createdAt})`;
          }

          // Cronologia. Rezerva rece nu are NICIUNA: n-a atins-o nimeni, ăsta e și rostul ei.
          if (!assignedTo) continue;

          await sql`
            insert into lead_interactions (tenant_id, lead_id, type, direction, body, user_id, occurred_at)
            values (${tenantId}, ${lead.id}, 'system', 'internal',
                    ${`Repartizat către ${AGENTS.find((a) => a.email === bucket.agent).name} (lot de import).`},
                    ${owner?.id ?? null}, ${assignedAt})`;

          if (staleOne) continue; // repartizat și neatins — pe ăsta îl prinde regula

          // Apelurile: câte unul pe încercare, cu rezultat din vocabularul CC-6.
          const attempts = stageIndex <= 1 ? between(1, 2) : between(2, 5);
          let callAt = new Date(assignedAt);
          let lastOutcome = null;
          let counted = 0;
          for (let a = 0; a < attempts; a++) {
            callAt = new Date(callAt.getTime() + between(1, 3) * 86400000);
            if (callAt > NOW) break;
            callAt.setHours(workHour(), pick([0, 15, 30, 45]), 0, 0);
            const pool = program.outcomes[stageKey] ?? ["no_answer"];
            // Ultimul apel al unui lead ajuns departe trebuie să fie cel care explică unde e.
            const outcome = a === attempts - 1 ? pool[pool.length - 1] : pick(pool);
            lastOutcome = outcome;
            if (!TERMINAL.has(outcome)) counted++;
            await sql`
              insert into lead_interactions (tenant_id, lead_id, type, direction, body, metadata, user_id, occurred_at)
              values (${tenantId}, ${lead.id}, 'call', 'outbound', ${`Apel ${a + 1}`},
                      ${sql.json({ outcome })}, ${assignedTo}, ${callAt})`;
          }
          await sql`
            update leads set call_attempts = ${counted}, last_call_at = ${callAt}, last_call_outcome = ${lastOutcome}
            where id = ${lead.id}`;

          // Tranzițiile de etapă: fără ele pâlnia s-ar sprijini doar pe poziția curentă.
          let moveAt = new Date(assignedAt);
          for (let s = 1; s <= stageIndex; s++) {
            moveAt = new Date(moveAt.getTime() + between(1, 4) * 86400000);
            if (moveAt > NOW) break;
            moveAt.setHours(workHour(), 0, 0, 0);
            await sql`
              insert into lead_interactions (tenant_id, lead_id, type, direction, body, metadata, user_id, occurred_at)
              values (${tenantId}, ${lead.id}, 'stage_change', 'internal',
                      ${`Etapă: ${program.stages[s - 1].label} → ${program.stages[s].label}`},
                      ${sql.json({ from: program.stages[s - 1].key, to: program.stages[s].key })}, ${assignedTo}, ${moveAt})`;
          }
        }
      }
    }

    }

    // ── 5. Normele KPI (ca gradul de realizare să aibă față de ce se măsura) ──
    const TARGETS = [
      { metric: "callsMade", target: 60 },
      { metric: "successfulContacts", target: 20 },
      { metric: "meetings", target: 4 },
      { metric: "offersSent", target: 6 },
      { metric: "contractsSigned", target: 2 },
    ];
    for (const t of TARGETS) {
      const [existing] = await sql`
        select id from crm_kpi_targets
        where tenant_id = ${tenantId} and user_id is null and period = 'week' and metric = ${t.metric}`;
      if (existing) {
        add(plan.skipped, "norme KPI");
        continue;
      }
      add(plan.created, "norme KPI");
      if (!APPLY) continue;
      await sql`
        insert into crm_kpi_targets (tenant_id, user_id, period, metric, target, created_at, updated_at)
        values (${tenantId}, null, 'week', ${t.metric}, ${t.target}, ${NOW}, ${NOW})`;
    }

    // ── Raportul ─────────────────────────────────────────────────────────────
    console.log("Creează:");
    for (const [k, v] of Object.entries(plan.created)) console.log(`  + ${k}: ${v}`);
    if (Object.keys(plan.skipped).length) {
      console.log("Sare peste (există deja):");
      for (const [k, v] of Object.entries(plan.skipped)) console.log(`  · ${k}: ${v}`);
    }
    if (APPLY) {
      // Raportul final citește din bază, nu din contoarele de mai sus: ce vezi aici e ce EXISTĂ,
      // inclusiv ce fusese scris la o rulare anterioară.
      for (const name of [PIPELINE_NAME, SPANCO_PIPELINE_NAME]) {
        const [row] = await sql`
          select
            count(*) filter (where l.assigned_to is null) as rezerva,
            count(*) filter (where l.assigned_to is not null) as repartizate,
            count(*) as total
          from leads l
          join crm_pipelines p on p.id = l.pipeline_id
          where l.tenant_id = ${tenantId} and p.name = ${name}`;
        console.log(`\nÎn pâlnia „${name}": ${row.total} contacte — ${row.rezerva} în rezervă, ${row.repartizate} repartizate.`);
      }
      console.log(`Agenți: ${AGENTS.map((a) => `${a.name} <${a.email}>`).join(", ")}`);
      console.log(`Parola lor: ${PASSWORD}`);
    } else {
      console.log("\nNimic nu s-a scris. Adaugă `--apply` pentru a scrie.");
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("\nEȘEC:", e.message);
  process.exit(1);
});
