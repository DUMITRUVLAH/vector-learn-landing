/**
 * CRM — importul de lead-uri din fișier (CSV / text lipit).
 *
 * Portat din crm-vector. Parsarea, maparea coloanelor, validarea și detectarea
 * duplicatelor sunt pure, în `server/lib/crm/importFile.ts`; aici e stratul care
 * le leagă de baza de date multi-tenant.
 *
 * DECIZIA CENTRALĂ: previzualizarea și importul propriu-zis rulează EXACT
 * aceeași funcție (`buildImportPlan`). Dacă previzualizarea ar fi făcută în
 * browser și inserarea pe server, cele două ar putea ajunge la concluzii
 * diferite — omul ar aproba un lucru și s-ar scrie altul. Un import peste o bază
 * reală e greu de desfăcut, deci ce se arată trebuie să fie ce se scrie.
 *
 * Trei lucruri pe care sursa nu le avea nevoie să facă, iar aici sunt
 * obligatorii, fiindcă FinFlow e multi-tenant și mai strict tipizat:
 *
 * 1. `assigned_to` e o CHEIE către `users`, nu text liber. Un nume din fișier se
 *    caută printre oamenii workspace-ului; dacă nu se găsește, lead-ul rămâne
 *    NEATRIBUIT cu avertisment — nu inventăm un responsabil și nu atribuim unui
 *    om din alt workspace.
 * 2. `stage` trebuie să fie o etapă CONFIGURATĂ a workspace-ului. Un text
 *    nerecunoscut ar crea o etapă fantomă: lead-ul ar exista în bază, dar n-ar
 *    apărea în nicio coloană din pâlnie. Cade pe prima etapă, cu avertisment.
 * 3. `source` e enum în Postgres — o valoare din afara listei ar face să pice
 *    întregul INSERT, deci se normalizează la "import"/"other".
 *
 * Firmografia (industrie, regiune, mărime, consum) NU există pe `leads` aici —
 * există pe `crm_companies`. Coloanele astea din fișier ajung pe fișa firmei, nu
 * se pierd și nu se falsifică pe lead.
 *
 * Montat la /api/crm/import.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadTags, customFields, leadFieldValues } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmCompanies, crmImportJobs, crmImportMappings } from "../db/schema/crmCompanies";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  parseDelimited,
  parseWorkbookTable,
  detectDelimiter,
  suggestMapping,
  applyMapping,
  validateDraft,
  findDuplicates,
  mapSourceText,
  mapStageText,
  IMPORT_TARGET_FIELDS,
  isImportTarget,
  customFieldKeyOf,
  normalizeIdno,
  type Delimiter,
  type FieldMapping,
  type ImportDraftLead,
  type ImportTargetField,
  type ImportTarget,
  type DuplicateStatus,
} from "../lib/crm/importFile";
import { ensureTenantStages, DEFAULT_STAGES } from "../lib/crm/stages";
import { normalizeEmail, normalizePhone } from "../lib/crm/normalize";

export const crmImportRoutes = new Hono<{ Variables: AuthVariables }>();
crmImportRoutes.use("/*", requireAuth);

/**
 * Plafonul de text acceptat într-o cerere. Vercel refuză corpuri peste ~4.5 MB,
 * iar un mesaj clar („fișierul e prea mare, împarte-l") e infinit mai util decât
 * un 413 fără explicație în mijlocul unui import.
 */
const MAX_TEXT_BYTES = 2_000_000;

/** Câte rânduri trimitem înapoi la previzualizare. Restul rămân doar în numărători. */
const PREVIEW_ROWS = 200;

const SOURCE_VALUES = new Set([
  "webform",
  "manual",
  "facebook_ad",
  "google_ads",
  "referral",
  "phone_in",
  "instagram",
  "import",
  "other",
]);

/**
 * Maparea acceptată din exterior: câmpurile fixe SAU `cf:<cheie>` pentru un câmp personalizat.
 * Nu mai e un `z.enum`, fiindcă lista de ținte depinde de workspace — dar nici un `z.string()`
 * liber: `isImportTarget` respinge orice altceva, ca o cheie inventată să nu ajungă în jurnalul
 * de importuri și de acolo într-o mapare salvată pe care nimeni n-o mai poate citi.
 */
const mappingSchema = z.record(
  z.string(),
  z.string().refine(isImportTarget, "Țintă de mapare necunoscută.")
) as unknown as z.ZodType<FieldMapping>;

const planInput = z.object({
  /**
   * Conținutul fișierului. Pentru CSV/text lipit e chiar textul; pentru `.xlsx` e registrul
   * codificat base64, iar `format: "xlsx"` spune serverului cum să-l citească. Browserul NU
   * parsează Excel: ar însemna o bibliotecă de ~800 KB în bundle, pentru o funcție folosită o
   * dată pe lună.
   */
  text: z.string().min(1, "Nu am primit niciun conținut de importat."),
  format: z.enum(["text", "xlsx"]).default("text"),
  delimiter: z.enum([",", ";", "\t"]).nullish(),
  /** Maparea aleasă de om. Lipsă → o propunem noi din antetul fișierului. */
  mapping: mappingSchema.nullish(),
});

const runInput = planInput.extend({
  fileName: z.string().max(300).nullish(),
  /** Implicit sărim peste duplicate — importul repetat al aceluiași fișier nu trebuie să dubleze baza. */
  skipDuplicates: z.boolean().default(true),
});

/**
 * Cheia după care se unifică firmele dintr-un import: codul fiscal când există, altfel numele
 * normalizat. Prefixul „idno:" ține cele două spații de chei separate — un cod format din cifre
 * n-are cum să coincidă cu un nume, dar cheile trebuie oricum să nu se poată confunda.
 */
function companyKeyOf(draft: ImportDraftLead): string | null {
  const idno = normalizeIdno(draft.idno);
  if (idno) return `idno:${idno}`;
  return normalizeCompanyName(draft.company);
}

function normalizeCompanyName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase() || null;
}

/** Numele unui om, adus la o formă comparabilă („Ana-Maria POP " ≈ "ana maria pop"). */
function normalizePersonName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return (
    raw
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() || null
  );
}

function isMissingSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|column .* does not exist|undefined_table|undefined_column/i.test(msg);
}

// ─── Planul de import ────────────────────────────────────────────────────────

/** Ce se întâmplă cu un rând: ce am înțeles din el, ce nu am putut lega și de ce. */
export interface PlannedRow {
  rowNumber: number;
  draft: ImportDraftLead;
  status: DuplicateStatus;
  errors: string[];
  warnings: string[];
  /** Rezolvările făcute pe server, ca previzualizarea să arate rezultatul real, nu textul brut. */
  resolved: {
    stage: string;
    stageLabel: string;
    source: string;
    assignedTo: string | null;
    assignedToName: string | null;
    companyName: string | null;
  };
}

export interface ImportPlan {
  headers: string[];
  delimiter: Delimiter;
  mapping: FieldMapping;
  rows: PlannedRow[];
  counts: {
    total: number;
    valid: number;
    errors: number;
    duplicatesInFile: number;
    duplicatesInDb: number;
    /** Câte rânduri se scriu efectiv cu `skipDuplicates: true` — numărul de pe buton. */
    importableNew: number;
    /** Câte se scriu dacă omul alege explicit să importe și duplicatele. */
    importableAll: number;
  };
  stages: { key: string; label: string }[];
  owners: { id: string; name: string }[];
  /** Câmpurile personalizate ale workspace-ului — țintele `cf:<cheie>` din select-ul de mapare. */
  customFields: { id: string; key: string; label: string }[];
}

/**
 * Singura funcție care înțelege un fișier. Previzualizarea o cheamă ca să arate,
 * importul o cheamă ca să scrie — cu aceleași argumente, deci cu același verdict.
 */
async function buildImportPlan(
  tenantId: string,
  input: { text: string; format?: "text" | "xlsx"; delimiter?: Delimiter | null; mapping?: FieldMapping | null }
): Promise<ImportPlan> {
  // Un registru Excel ajunge la aceeași formă (antet + rânduri) ca un CSV; de aici încolo,
  // restul importului nu știe și nu-l interesează de unde a venit fișierul.
  // Un registru Excel n-are separator; păstrăm unul doar ca răspunsul să aibă aceeași formă
  // pentru ambele căi (interfața îl afișează la pasul de confirmare).
  const delimiter: Delimiter = input.format === "xlsx" ? ";" : ((input.delimiter ?? detectDelimiter(input.text)) as Delimiter);
  const table =
    input.format === "xlsx"
      ? await parseWorkbookTable(Buffer.from(input.text, "base64"))
      : parseDelimited(input.text, delimiter);
  // Câmpurile personalizate ale workspace-ului: și propunerea de mapare, și validarea țintelor
  // `cf:<cheie>` se sprijină pe ele, deci se citesc ÎNAINTE de a interpreta maparea.
  const customFieldRows = await loadCustomFields(tenantId);
  const customFieldByKey = new Map(customFieldRows.map((f) => [f.key, f]));

  const mapping =
    input.mapping && Object.keys(input.mapping).length > 0
      ? input.mapping
      : suggestMapping(table.headers, customFieldRows);

  // O țintă `cf:<cheie>` care nu mai există (câmpul a fost șters după ce s-a salvat maparea) nu
  // are unde scrie. O scoatem din mapare ȘI o spunem în avertismente — mai bine o coloană
  // declarată pierdută decât una pierdută în tăcere.
  const droppedCustomTargets: string[] = [];
  const effectiveMapping: FieldMapping = {};
  for (const [idx, target] of Object.entries(mapping)) {
    const key = customFieldKeyOf(target);
    if (key && !customFieldByKey.has(key)) {
      droppedCustomTargets.push(key);
      effectiveMapping[Number(idx)] = "ignore";
      continue;
    }
    effectiveMapping[Number(idx)] = target as ImportTarget;
  }

  const drafts = applyMapping(table.rows, effectiveMapping);

  // Oamenii și etapele workspace-ului — o singură citire pentru tot fișierul.
  await ensureTenantStages(tenantId);
  const [stageRows, memberRows] = await Promise.all([
    db
      .select({ key: crmPipelineStages.key, label: crmPipelineStages.label, orderIndex: crmPipelineStages.orderIndex })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId))
      .orderBy(crmPipelineStages.orderIndex),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.tenantId, tenantId)),
  ]);

  const stages = stageRows.length > 0
    ? stageRows.map((s) => ({ key: s.key, label: s.label }))
    : DEFAULT_STAGES.map((s) => ({ key: s.key, label: s.label }));
  const stageByKey = new Map(stages.map((s) => [s.key.toLowerCase(), s]));
  const stageByLabel = new Map(stages.map((s) => [normalizePersonName(s.label) ?? s.label, s]));
  const fallbackStage = stages[0];

  const ownerById = new Map(memberRows.map((m) => [m.id, m.name ?? m.email]));
  const ownerByEmail = new Map(memberRows.map((m) => [m.email.toLowerCase(), m]));
  const ownerByName = new Map<string, (typeof memberRows)[number]>();
  for (const m of memberRows) {
    const key = normalizePersonName(m.name);
    // Nume identice în același workspace: nu ghicim pe cine dintre ei — prima
    // potrivire ar fi arbitrară, așa că marcăm cheia ca ambiguă și o sărim.
    if (!key) continue;
    if (ownerByName.has(key)) ownerByName.set(key, null as never);
    else ownerByName.set(key, m);
  }

  // Cheile deja existente în bază, limitate la ce apare în fișier: o listă
  // bounded de fișierul omului, nu o citire a întregii baze.
  const fileKeys = new Set<string>();
  const fileIdnos = new Set<string>();
  for (const d of drafts) {
    if (d.phone_normalized) fileKeys.add(d.phone_normalized);
    if (d.email_normalized) fileKeys.add(d.email_normalized);
    const idno = normalizeIdno(d.idno);
    if (idno) fileIdnos.add(idno);
  }
  const existingKeys = await loadExistingKeys(tenantId, [...fileKeys]);
  for (const idno of await loadExistingIdnos(tenantId, [...fileIdnos])) existingKeys.add(`idno:${idno}`);
  const statuses = findDuplicates(drafts, existingKeys);

  const rows: PlannedRow[] = drafts.map((draft, i) => {
    const { errors, warnings } = validateDraft(draft);
    const status = statuses[i];

    // Etapa: cheie exactă, apoi eticheta afișată, apoi maparea din text liber.
    const rawStage = draft.stage;
    let stage = fallbackStage;
    if (rawStage) {
      const byKey = stageByKey.get(rawStage.trim().toLowerCase());
      const byLabel = stageByLabel.get(normalizePersonName(rawStage) ?? "");
      const byText = stageByKey.get(mapStageText(rawStage).toLowerCase());
      const hit = byKey ?? byLabel ?? byText;
      if (hit) stage = hit;
      else warnings.push(`Etapa „${rawStage}" nu există în pâlnie — lead-ul intră în „${fallbackStage.label}".`);
    }

    const source = mapSourceText(draft.source);
    const safeSource = SOURCE_VALUES.has(source) ? source : "other";

    let assignedTo: string | null = null;
    if (draft.assigned_to) {
      const byEmail = ownerByEmail.get(draft.assigned_to.trim().toLowerCase());
      const byName = ownerByName.get(normalizePersonName(draft.assigned_to) ?? "");
      const hit = byEmail ?? byName ?? null;
      if (hit) assignedTo = hit.id;
      else warnings.push(`„${draft.assigned_to}" nu e în echipa acestui workspace — lead-ul rămâne neatribuit.`);
    }

    return {
      rowNumber: draft.rowNumber,
      draft,
      status,
      errors,
      warnings,
      resolved: {
        stage: stage.key,
        stageLabel: stage.label,
        source: safeSource,
        assignedTo,
        assignedToName: assignedTo ? ownerById.get(assignedTo) ?? null : null,
        companyName: draft.company,
      },
    };
  });

  if (droppedCustomTargets.length > 0) {
    for (const row of rows) {
      row.warnings.push(
        `Câmpurile personalizate ${droppedCustomTargets.map((k) => `„${k}"`).join(", ")} nu mai există — coloanele lor nu se importă.`
      );
    }
  }

  return {
    headers: table.headers,
    delimiter,
    mapping: effectiveMapping,
    rows,
    counts: {
      total: rows.length,
      valid: rows.filter((r) => r.errors.length === 0).length,
      errors: rows.filter((r) => r.errors.length > 0).length,
      duplicatesInFile: rows.filter((r) => r.status === "duplicate_in_file").length,
      duplicatesInDb: rows.filter((r) => r.status === "duplicate_in_db").length,
      // Numerele pe care le arată butonul se calculează AICI, cu aceleași reguli
      // de filtrare pe care le aplică `/run` mai jos. Dacă interfața le-ar
      // recalcula singură, butonul ar putea promite un număr, iar importul ar
      // scrie altul — exact eroarea pe care tot ecranul încearcă s-o evite.
      importableNew: rows.filter((r) => r.errors.length === 0 && r.status === "new").length,
      importableAll: rows.filter((r) => r.errors.length === 0).length,
    },
    stages,
    owners: memberRows.map((m) => ({ id: m.id, name: m.name ?? m.email })),
    customFields: customFieldRows,
  };
}

/** Definițiile câmpurilor personalizate ale workspace-ului. Tabela există din migrarea 0007, dar
 *  o bază veche poate să n-o aibă — atunci importul merge mai departe fără ținte `cf:`, nu cade. */
async function loadCustomFields(tenantId: string): Promise<{ id: string; key: string; label: string }[]> {
  try {
    return await db
      .select({ id: customFields.id, key: customFields.key, label: customFields.label })
      .from(customFields)
      .where(eq(customFields.tenantId, tenantId))
      .orderBy(customFields.orderIndex);
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    console.error("[crm-import] câmpurile personalizate nu s-au putut citi:", err);
    return [];
  }
}

/**
 * Codurile fiscale din fișier ale firmelor care au deja un lead în workspace.
 *
 * Comparația se face pe forma NORMALIZATĂ, calculată în bază: fișele vechi pot avea „MD 1003…"
 * sau „1003-600-012345", iar un `IN` pe textul brut le-ar rata și am crea a doua fișă pentru
 * aceeași firmă. Importul scrie de acum codul deja normalizat (vezi `upsertCompanies`), deci
 * forma din bază converge singură.
 */
async function loadExistingIdnos(tenantId: string, idnos: string[]): Promise<string[]> {
  if (idnos.length === 0) return [];
  const out: string[] = [];
  const normalizedColumn = sql<string>`regexp_replace(upper(regexp_replace(${crmCompanies.idno}, '[^A-Za-z0-9]', '', 'g')), '^MD([0-9]{13})$', '\\1')`;
  try {
    const CHUNK = 500;
    for (let i = 0; i < idnos.length; i += CHUNK) {
      // Doar firmele care au DEJA un lead activ: o firmă adusă din lista de clienți (fără
      // oportunitate) nu face din primul ei lead un duplicat — altfel, după importul de firme,
      // importul lead-urilor lor s-ar sări integral.
      const rows = await db
        .selectDistinct({ idno: normalizedColumn })
        .from(crmCompanies)
        .innerJoin(
          leads,
          and(eq(leads.companyId, crmCompanies.id), eq(leads.tenantId, tenantId), isNull(leads.mergedIntoId))
        )
        .where(and(eq(crmCompanies.tenantId, tenantId), inArray(normalizedColumn, idnos.slice(i, i + CHUNK))));
      for (const r of rows) {
        const norm = normalizeIdno(r.idno);
        if (norm) out.push(norm);
      }
    }
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err;
    console.error("[crm-import] codurile fiscale existente nu s-au putut citi:", err);
  }
  return out;
}

/**
 * Cheile de dedup deja existente în workspace, căutate DOAR pentru valorile din
 * fișier. Interogarea se taie în bucăți: un `IN (...)` cu zeci de mii de valori
 * dintr-un export mare ar depăși limitele de parametri ale driverului.
 */
async function loadExistingKeys(tenantId: string, keys: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (keys.length === 0) return out;

  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    const rows = await db
      .select({ phone: leads.phoneNormalized, email: leads.emailNormalized })
      .from(leads)
      .where(
        and(
          eq(leads.tenantId, tenantId),
          isNull(leads.mergedIntoId),
          or(inArray(leads.phoneNormalized, slice), inArray(leads.emailNormalized, slice))
        )
      );
    for (const r of rows) {
      if (r.phone) out.add(r.phone);
      if (r.email) out.add(r.email);
    }
  }
  return out;
}

// ─── Previzualizare ──────────────────────────────────────────────────────────

crmImportRoutes.post("/preview", zValidator("json", planInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if (Buffer.byteLength(body.text, "utf8") > MAX_TEXT_BYTES) {
    return c.json({ error: "Fișierul e prea mare pentru un singur import. Împarte-l în bucăți mai mici." }, 413);
  }

  try {
    const plan = await buildImportPlan(user.tenantId, {
      text: body.text,
      delimiter: body.delimiter ?? null,
      mapping: (body.mapping as FieldMapping | null) ?? null,
    });
    return c.json({
      headers: plan.headers,
      delimiter: plan.delimiter,
      mapping: plan.mapping,
      counts: plan.counts,
      stages: plan.stages,
      owners: plan.owners,
      customFields: plan.customFields,
      // Trunchiat: omul vede primele rânduri, numărătorile sunt pe tot fișierul.
      rows: plan.rows.slice(0, PREVIEW_ROWS),
      truncated: plan.rows.length > PREVIEW_ROWS,
    });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return c.json({ error: "Modulul de import nu e încă pregătit pe acest workspace." }, 503);
    }
    throw err;
  }
});

// ─── Importul propriu-zis ────────────────────────────────────────────────────

crmImportRoutes.post("/run", zValidator("json", runInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  if (Buffer.byteLength(body.text, "utf8") > MAX_TEXT_BYTES) {
    return c.json({ error: "Fișierul e prea mare pentru un singur import. Împarte-l în bucăți mai mici." }, 413);
  }

  const plan = await buildImportPlan(user.tenantId, {
    text: body.text,
    delimiter: body.delimiter ?? null,
    mapping: (body.mapping as FieldMapping | null) ?? null,
  });

  const skipped: { rowNumber: number; reason: string }[] = [];
  const toInsert: PlannedRow[] = [];
  for (const row of plan.rows) {
    if (row.errors.length > 0) {
      skipped.push({ rowNumber: row.rowNumber, reason: row.errors.join(" ") });
      continue;
    }
    if (body.skipDuplicates && row.status !== "new") {
      skipped.push({
        rowNumber: row.rowNumber,
        reason: row.status === "duplicate_in_db" ? "Există deja în bază." : "Repetat în fișier.",
      });
      continue;
    }
    toInsert.push(row);
  }

  // Firmele întâi: lead-ul are nevoie de `company_id`, deci fișa firmei trebuie
  // să existe înainte. Firmografia din fișier se așază aici, unde are coloane —
  // pe lead n-ar avea unde.
  const companyIds = await upsertCompanies(user.tenantId, toInsert);

  let created = 0;
  /** Rândul din fișier → id-ul lead-ului scris, pentru etichete și câmpuri personalizate. */
  const insertedPairs: { row: PlannedRow; leadId: string }[] = [];
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert[i] ? toInsert.slice(i, i + BATCH) : [];
    if (slice.length === 0) continue;
    const values = slice.map((row) => ({
      tenantId: user.tenantId,
      fullName: row.draft.full_name.slice(0, 200),
      fullNameNormalized: normalizePersonName(row.draft.full_name)?.slice(0, 200) ?? null,
      phone: row.draft.phone?.slice(0, 32) ?? null,
      phoneNormalized: row.draft.phone_normalized,
      email: row.draft.email?.slice(0, 255) ?? null,
      emailNormalized: row.draft.email_normalized,
      interestCourse: row.draft.interest_course?.slice(0, 200) ?? null,
      stage: row.resolved.stage,
      source: row.resolved.source as "import",
      assignedTo: row.resolved.assignedTo,
      notes: row.draft.notes?.slice(0, 2000) ?? null,
      valueCents: row.draft.value_cents ?? 0,
      company: row.draft.company?.slice(0, 300) ?? null,
      companyId: companyIds.get(companyKeyOf(row.draft) ?? "") ?? null,
      dealName: row.draft.deal_name?.slice(0, 300) ?? null,
    }));
    const inserted = await db.insert(leads).values(values).returning({ id: leads.id });
    created += inserted.length;
    // `RETURNING` respectă ordinea din `VALUES`, deci rândul `k` din felie e lead-ul `k`. Când
    // baza întoarce mai puține rânduri decât am trimis (nu se întâmplă azi, dar un
    // `onConflictDoNothing` adăugat mâine ar face-o), ne oprim la cât avem — mai bine câteva
    // etichete nescrise decât etichetele unui lead puse pe altul.
    for (let k = 0; k < inserted.length && k < slice.length; k++) {
      insertedPairs.push({ row: slice[k], leadId: inserted[k].id });
    }
  }

  // Etichetele și câmpurile personalizate, DUPĂ lead-uri: amândouă au nevoie de `lead_id`.
  // Eșecul lor nu anulează importul — lead-urile sunt deja scrise, iar un „importul a eșuat"
  // l-ar face pe om să reimporte și să dubleze baza.
  const extrasWritten = await writeLeadExtras(user.tenantId, insertedPairs);

  // Jurnalul: cine, ce fișier, cu ce mapare, cu ce rezultat. Un import prost
  // peste o bază reală trebuie să poată fi explicat după fapt.
  let jobId: string | null = null;
  try {
    const [job] = await db
      .insert(crmImportJobs)
      .values({
        tenantId: user.tenantId,
        fileName: body.fileName?.slice(0, 300) ?? null,
        source: "file",
        mapping: plan.mapping,
        totalRows: plan.counts.total,
        createdCount: created,
        duplicateCount: plan.counts.duplicatesInDb + plan.counts.duplicatesInFile,
        errorCount: plan.counts.errors,
        errors: skipped.slice(0, 500),
        createdBy: user.id,
      })
      .returning({ id: crmImportJobs.id });
    jobId = job?.id ?? null;
  } catch (err) {
    // Lead-urile sunt deja scrise; un jurnal care nu s-a putut scrie nu e motiv
    // să-i spunem omului că importul a eșuat — ar reimporta și ar dubla baza.
    console.error("[crm-import] jurnalul nu s-a putut scrie:", err);
  }

  return c.json({
    jobId,
    created,
    skipped: skipped.length,
    counts: plan.counts,
    details: skipped.slice(0, 200),
    tagsWritten: extrasWritten.tags,
    customValuesWritten: extrasWritten.customValues,
  });
});

/**
 * Scrie etichetele și valorile câmpurilor personalizate ale lead-urilor tocmai importate.
 *
 * `onConflictDoNothing` pe etichete: indexul `ltags_unique_idx` e pe (lead_id, tag), iar același
 * fișier poate repeta o etichetă pe același rând din două coloane diferite.
 */
async function writeLeadExtras(
  tenantId: string,
  pairs: { row: PlannedRow; leadId: string }[]
): Promise<{ tags: number; customValues: number }> {
  let tags = 0;
  let customValues = 0;
  if (pairs.length === 0) return { tags, customValues };

  const tagValues = pairs.flatMap(({ row, leadId }) =>
    row.draft.tags.map((tag) => ({ tenantId, leadId, tag: tag.slice(0, 100) }))
  );
  if (tagValues.length > 0) {
    try {
      const BATCH = 500;
      for (let i = 0; i < tagValues.length; i += BATCH) {
        await db.insert(leadTags).values(tagValues.slice(i, i + BATCH)).onConflictDoNothing();
      }
      tags = tagValues.length;
    } catch (err) {
      console.error("[crm-import] etichetele nu s-au putut scrie:", err);
    }
  }

  try {
    const fieldRows = await loadCustomFields(tenantId);
    const idByKey = new Map(fieldRows.map((f) => [f.key, f.id]));
    const valueRows = pairs.flatMap(({ row, leadId }) =>
      Object.entries(row.draft.custom_values)
        .map(([key, value]) => {
          const fieldId = idByKey.get(key);
          return fieldId ? { tenantId, leadId, fieldId, value } : null;
        })
        .filter((v): v is { tenantId: string; leadId: string; fieldId: string; value: string } => v !== null)
    );
    if (valueRows.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < valueRows.length; i += BATCH) {
        await db.insert(leadFieldValues).values(valueRows.slice(i, i + BATCH)).onConflictDoNothing();
      }
      customValues = valueRows.length;
    }
  } catch (err) {
    console.error("[crm-import] câmpurile personalizate nu s-au putut scrie:", err);
  }

  return { tags, customValues };
}

/**
 * Creează/găsește firmele din rândurile care se vor importa și întoarce
 * `nume normalizat → id`. Firmele existente NU se rescriu: un import nu trebuie
 * să poată strica o fișă de firmă completată de om. Se completează doar
 * câmpurile goale.
 */
async function upsertCompanies(tenantId: string, rows: PlannedRow[]): Promise<Map<string, string>> {
  const byKey = new Map<string, PlannedRow>();
  for (const row of rows) {
    const key = companyKeyOf(row.draft);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  const out = new Map<string, string>();
  if (byKey.size === 0) return out;

  const idnoKeys = [...byKey.keys()].filter((k) => k.startsWith("idno:")).map((k) => k.slice(5));
  const nameKeys = [...byKey.keys()].filter((k) => !k.startsWith("idno:"));
  const normalizedIdno = sql<string>`regexp_replace(upper(regexp_replace(${crmCompanies.idno}, '[^A-Za-z0-9]', '', 'g')), '^MD([0-9]{13})$', '\\1')`;

  try {
    // Codul fiscal bate numele: „SRL Alfa" și „Alfa SRL" sunt aceeași firmă dacă au același IDNO,
    // iar două firme distincte pot avea nume aproape identice.
    if (idnoKeys.length > 0) {
      const existingByIdno = await db
        .select({ id: crmCompanies.id, idno: normalizedIdno })
        .from(crmCompanies)
        .where(and(eq(crmCompanies.tenantId, tenantId), inArray(normalizedIdno, idnoKeys)));
      for (const e of existingByIdno) {
        if (e.idno) out.set(`idno:${e.idno}`, e.id);
      }
    }

    if (nameKeys.length > 0) {
      const existing = await db
        .select({ id: crmCompanies.id, nameNormalized: crmCompanies.nameNormalized })
        .from(crmCompanies)
        .where(and(eq(crmCompanies.tenantId, tenantId), inArray(crmCompanies.nameNormalized, nameKeys)));
      for (const e of existing) {
        if (e.nameNormalized) out.set(e.nameNormalized, e.id);
      }
    }

    const missing = [...byKey.entries()].filter(([key]) => !out.has(key));
    if (missing.length > 0) {
      const inserted = await db
        .insert(crmCompanies)
        .values(
          missing.map(([key, row]) => ({
            tenantId,
            name: (row.draft.company ?? "").slice(0, 300),
            nameNormalized: normalizeCompanyName(row.draft.company)?.slice(0, 300) ?? key.slice(0, 300),
            // Codul se scrie NORMALIZAT: așa cheia de dedup din bază e aceeași cu cea din import.
            idno: normalizeIdno(row.draft.idno)?.slice(0, 40) ?? null,
            industry: row.draft.industry?.slice(0, 120) ?? null,
            region: row.draft.region?.slice(0, 120) ?? null,
            companySize: row.draft.company_size?.slice(0, 40) ?? null,
            annualConsumptionKwh:
              row.draft.annual_consumption_kwh != null ? String(row.draft.annual_consumption_kwh) : null,
            phone: row.draft.phone?.slice(0, 32) ?? null,
            phoneNormalized: normalizePhone(row.draft.phone),
            email: row.draft.email?.slice(0, 255) ?? null,
            emailNormalized: normalizeEmail(row.draft.email),
          }))
        )
        .returning({ id: crmCompanies.id });
      // Ca la lead-uri: `RETURNING` păstrează ordinea din `VALUES`.
      for (let i = 0; i < inserted.length && i < missing.length; i++) {
        out.set(missing[i][0], inserted[i].id);
      }
    }
  } catch (err) {
    // Fără fișe de firmă, lead-urile intră oricum — cu numele firmei ca text,
    // exact cum erau înainte ca modulul de firme să existe.
    if (!isMissingSchemaError(err)) throw err;
    console.error("[crm-import] firmele nu s-au putut crea:", err);
  }
  return out;
}

// ─── Mapări salvate ──────────────────────────────────────────────────────────

crmImportRoutes.get("/mappings", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmImportMappings)
      .where(eq(crmImportMappings.tenantId, user.tenantId))
      .orderBy(crmImportMappings.name);
    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});

crmImportRoutes.post(
  "/mappings",
  zValidator("json", z.object({ name: z.string().min(1).max(200), mapping: mappingSchema })),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const [existing] = await db
      .select({ id: crmImportMappings.id })
      .from(crmImportMappings)
      .where(and(eq(crmImportMappings.tenantId, user.tenantId), eq(crmImportMappings.name, body.name)));

    if (existing) {
      const [updated] = await db
        .update(crmImportMappings)
        .set({ mapping: body.mapping, updatedAt: new Date() })
        .where(and(eq(crmImportMappings.id, existing.id), eq(crmImportMappings.tenantId, user.tenantId)))
        .returning();
      return c.json(updated);
    }

    const [created] = await db
      .insert(crmImportMappings)
      .values({ tenantId: user.tenantId, name: body.name, mapping: body.mapping })
      .returning();
    return c.json(created, 201);
  }
);

crmImportRoutes.delete("/mappings/:id", async (c) => {
  const user = c.get("user");
  const [deleted] = await db
    .delete(crmImportMappings)
    .where(and(eq(crmImportMappings.id, c.req.param("id")), eq(crmImportMappings.tenantId, user.tenantId)))
    .returning({ id: crmImportMappings.id });
  if (!deleted) return c.json({ error: "Maparea nu există." }, 404);
  return c.json({ ok: true });
});

// ─── Istoricul importurilor ──────────────────────────────────────────────────

crmImportRoutes.get("/jobs", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select({
        id: crmImportJobs.id,
        fileName: crmImportJobs.fileName,
        totalRows: crmImportJobs.totalRows,
        createdCount: crmImportJobs.createdCount,
        duplicateCount: crmImportJobs.duplicateCount,
        errorCount: crmImportJobs.errorCount,
        createdAt: crmImportJobs.createdAt,
        createdByName: users.name,
      })
      .from(crmImportJobs)
      .leftJoin(users, eq(users.id, crmImportJobs.createdBy))
      .where(eq(crmImportJobs.tenantId, user.tenantId))
      .orderBy(desc(crmImportJobs.createdAt))
      .limit(50);
    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});

/** Câmpurile în care se poate mapa o coloană — interfața le ia de aici, nu le redeclară. */
crmImportRoutes.get("/fields", (c) => {
  const fields: { value: ImportTargetField; label: string }[] = IMPORT_TARGET_FIELDS.map((f) => ({
    value: f,
    label: f,
  }));
  return c.json({ fields });
});
