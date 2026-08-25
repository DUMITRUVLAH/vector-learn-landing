/**
 * VM1-02: PAR Config Import — import payers, projects, departments, and budget codes from Excel.
 *
 * Routes:
 *   GET  /api/par/config-import/template  — download the .xlsx template
 *   POST /api/par/config-import           — upload + parse + upsert (par_admin only)
 *
 * CRITICAL: exceljs MUST be imported dynamically (lazy) — a top-level import
 * caused a prod outage (whole API down). Pattern from server/lib/docmerge/excelImport.ts.
 *
 * Sheets are matched by their COLUMN HEADERS first, then by sheet name, and only by
 * position for legacy files where nothing else matched — see server/lib/par/configImportSheets.ts
 * for why (a real one-sheet file silently imported 0 budget codes and 41 duplicate projects).
 *
 * Recognised columns (diacritics/case/`*` insensitive):
 *   Plătitori:      Denumire plătitor | Denumire juridică | IDNO
 *   Proiecte:       Denumire proiect | Donor | Plătitor / Organizație
 *   Departamente:   Denumire departament
 *   Coduri buget:   Cod (or "Cod buget") | Denumire | Suma alocată (MDL) | Plătitor | Proiect
 *
 * Validation:
 *   - Required fields missing → row skipped + reported as a row error
 *   - Upserts: payer by name, project by (payer, name), department by name, budget code by (payer, code)
 *   - A project named on a budget-code row is created on the fly if it doesn't exist yet
 */
import { Hono } from "hono";
import type ExcelJS from "exceljs";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parProjects, parDepartments, parBudgetCodes, parPayers, parPayerModules } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { mayAccessPayer } from "../lib/par/projectScope";
import {
  ALLOCATED_ALIASES,
  CODE_ALIASES,
  DEPARTMENT_NAME_ALIASES,
  NAME_ALIASES,
  PAYER_ALIASES,
  PAYER_NAME_ALIASES,
  PROJECT_ALIASES,
  PROJECT_NAME_ALIASES,
  type ImportRow,
  type SheetKind,
  classifyWorkbook,
  getField,
  parseMdlAmount,
  splitCodeAndName,
} from "../lib/par/configImportSheets";

/** Context threaded into the upsert helpers so each row honours the caller's scope (PARQA). */
interface ImportCtx {
  tenantId: string;
  userId: string;
  role: string;
  /** Only a workspace admin/manager may create NEW payers (mirrors POST /api/par/payers). */
  canManagePayers: boolean;
}

export const parConfigImportRoutes = new Hono<{ Variables: AuthVariables }>();
parConfigImportRoutes.use("*", requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowError {
  row: number;
  column: string;
  message: string;
}

interface CategoryResult {
  created: number;
  updated: number;
  errors: RowError[];
}

interface ImportResult {
  payers: CategoryResult;
  projects: CategoryResult;
  departments: CategoryResult;
  budgetCodes: CategoryResult;
  /** Human-readable notes: which sheet was read as what, which sheets were ignored. */
  warnings: string[];
}

/** DB column limits — exceeding them used to blow up the whole request with a 500. */
const MAX_CODE_LEN = 50;
const MAX_NAME_LEN = 200;

const KIND_LABELS: Record<SheetKind, string> = {
  payers: "Plătitori / Organizații",
  projects: "Proiecte/Programe",
  departments: "Departamente",
  budgetCodes: "Coduri bugetare",
};

// ─── GET /template ────────────────────────────────────────────────────────────

/**
 * Returns a ready-made .xlsx template the par_admin can fill and upload.
 * Four worksheets: Plătitori, Proiecte, Departamente, Coduri buget.
 */
parConfigImportRoutes.get(
  "/template",
  requirePARRole("par_admin"),
  async (c) => {
    const { default: ExcelJSRuntime } = (await import("exceljs")) as {
      default: typeof ExcelJS;
    };

    const wb = new ExcelJSRuntime.Workbook();
    wb.creator = "Vector Learn — PAR";

    // Sheet 1: Payers / legal entities
    const ws0 = wb.addWorksheet("Plătitori");
    ws0.columns = [
      { header: "Denumire plătitor *", key: "name", width: 35 },
      { header: "Denumire juridică", key: "legalName", width: 35 },
      { header: "IDNO", key: "idno", width: 20 },
    ];
    ws0.getRow(1).font = { bold: true };

    // Sheet 2: Projects
    const ws1 = wb.addWorksheet("Proiecte");
    ws1.columns = [
      { header: "Denumire proiect *", key: "name", width: 35 },
      { header: "Donor / Finanțator", key: "donor", width: 25 },
      { header: "Plătitor / Organizație *", key: "payer", width: 35 },
    ];
    ws1.getRow(1).font = { bold: true };

    // Sheet 2: Departments
    const ws2 = wb.addWorksheet("Departamente");
    ws2.columns = [
      { header: "Denumire departament *", key: "name", width: 35 },
    ];
    ws2.getRow(1).font = { bold: true };

    // Sheet 3: Budget codes
    const ws3 = wb.addWorksheet("Coduri buget");
    ws3.columns = [
      { header: "Cod buget *", key: "code", width: 20 },
      { header: "Denumire *", key: "name", width: 35 },
      { header: "Suma alocată (MDL)", key: "allocated", width: 22 },
      { header: "Plătitor / Organizație *", key: "payer", width: 35 },
      { header: "Proiect (opțional)", key: "project", width: 35 },
    ];
    ws3.getRow(1).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", "attachment; filename=\"par-config-template.xlsx\"");
    return c.body(Buffer.from(buffer));
  }
);

// ─── POST / ───────────────────────────────────────────────────────────────────

/**
 * Parse and import the uploaded .xlsx config file.
 * Returns { payers, projects, departments, budgetCodes, warnings }.
 */
parConfigImportRoutes.post(
  "/",
  requirePARRole("par_admin"),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const ctx: ImportCtx = {
      tenantId,
      userId: user.id,
      role: user.role,
      canManagePayers: user.role === "admin" || user.role === "manager",
    };

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: "Cererea trebuie să fie multipart/form-data cu câmpul 'file'." }, 400);
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return c.json({ error: "Câmpul 'file' lipsește sau nu este un fișier." }, 400);
    }

    const fileName = (file as File).name ?? "";
    if (!fileName.toLowerCase().endsWith(".xlsx")) {
      return c.json({ error: "Doar fișiere .xlsx sunt acceptate." }, 400);
    }

    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Lazy-load exceljs (critical — top-level import = prod outage)
    const { default: ExcelJSRuntime } = (await import("exceljs")) as {
      default: typeof ExcelJS;
    };

    const wb = new ExcelJSRuntime.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      return c.json({ error: "Fișierul Excel nu poate fi citit. Verifică dacă este un .xlsx valid." }, 422);
    }

    // Classify every worksheet by headers → name → (legacy) position.
    const sheets = classifyWorkbook(wb);
    const recognised = sheets.filter((s) => s.kind !== null);

    if (recognised.length === 0) {
      const found = sheets.map((s) => `„${s.name}" (${s.headers.filter(Boolean).join(", ") || "fără antet"})`).join("; ");
      return c.json(
        {
          error:
            "Nicio foaie din fișier nu a putut fi recunoscută. Prima linie a foii trebuie să conțină " +
            "antetul coloanelor: „Cod\" + „Denumire\" pentru coduri bugetare, „Denumire proiect\" pentru " +
            "proiecte, „Denumire departament\" pentru departamente, „Denumire plătitor\" pentru plătitori. " +
            `Foi găsite: ${found}.`,
        },
        422
      );
    }

    const rowsFor = (kind: SheetKind): ImportRow[] =>
      recognised.filter((s) => s.kind === kind).flatMap((s) => s.rows);

    const warnings: string[] = [];
    for (const sheet of sheets) {
      if (sheet.kind === null) {
        warnings.push(`Foaia „${sheet.name}" a fost ignorată — antetul coloanelor nu a putut fi recunoscut.`);
      } else if (sheet.via !== "name") {
        warnings.push(`Foaia „${sheet.name}" a fost citită ca „${KIND_LABELS[sheet.kind]}" (${sheet.rows.length} rânduri).`);
      }
    }

    // Payers and projects first — budget codes reference them.
    const payerResult = await upsertPayers(ctx, rowsFor("payers"));
    const projectResult = await upsertProjects(ctx, rowsFor("projects"));
    const deptResult = await upsertDepartments(tenantId, rowsFor("departments"));
    const budgetResult = await upsertBudgetCodes(ctx, rowsFor("budgetCodes"), projectResult);

    const result: ImportResult = {
      payers: payerResult,
      projects: projectResult,
      departments: deptResult,
      budgetCodes: budgetResult,
      warnings,
    };

    return c.json(result);
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyResult(): CategoryResult {
  return { created: 0, updated: 0, errors: [] };
}

/** Turn an unexpected DB failure on ONE row into a row error instead of a 500 for the file. */
function rowFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Rândul nu a putut fi salvat: ${message}`;
}

// ─── Upsert functions ─────────────────────────────────────────────────────────

async function upsertPayers(ctx: ImportCtx, rows: ImportRow[]): Promise<CategoryResult> {
  const { tenantId } = ctx;
  const res = emptyResult();

  for (const { row, data } of rows) {
    const name = getField(data, ...PAYER_NAME_ALIASES);
    const legalName = getField(data, "Denumire juridică", "legalName");
    const idno = getField(data, "IDNO", "idno");
    if (!name) {
      res.errors.push({ row, column: "Denumire plătitor", message: "Câmpul 'Denumire plătitor' este obligatoriu." });
      continue;
    }
    if (name.length > MAX_NAME_LEN) {
      res.errors.push({ row, column: "Denumire plătitor", message: `Denumirea depășește ${MAX_NAME_LEN} de caractere.` });
      continue;
    }
    try {
      const [existing] = await db.select({ id: parPayers.id }).from(parPayers).where(and(eq(parPayers.tenantId, tenantId), eq(parPayers.name, name)));
      if (existing) {
        // PARQA: only touch payers the caller may access.
        if (!(await mayAccessPayer(ctx.userId, tenantId, existing.id, ctx.role))) {
          res.errors.push({ row, column: "Denumire plătitor", message: `Nu ai acces la plătitorul '${name}'.` });
          continue;
        }
        await db.update(parPayers).set({ legalName: legalName || null, idno: idno || null, active: true, updatedAt: new Date() }).where(eq(parPayers.id, existing.id));
        res.updated++;
      } else {
        // PARQA: creating a NEW legal entity is a workspace-admin action (mirrors POST /api/par/payers).
        if (!ctx.canManagePayers) {
          res.errors.push({ row, column: "Denumire plătitor", message: "Doar un administrator de workspace poate crea plătitori noi." });
          continue;
        }
        const [payer] = await db.insert(parPayers).values({ tenantId, name, legalName: legalName || null, idno: idno || null }).returning();
        await db.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });
        res.created++;
      }
    } catch (err) {
      res.errors.push({ row, column: "Denumire plătitor", message: rowFailure(err) });
    }
  }
  return res;
}

async function resolvePayer(tenantId: string, name: string) {
  const conditions = [eq(parPayers.tenantId, tenantId), eq(parPayers.active, true)];
  if (name) conditions.push(eq(parPayers.name, name));
  const [payer] = await db.select({ id: parPayers.id }).from(parPayers).where(and(...conditions)).orderBy(asc(parPayers.createdAt)).limit(1);
  return payer ?? null;
}

async function upsertProjects(ctx: ImportCtx, rows: ImportRow[]): Promise<CategoryResult> {
  const { tenantId } = ctx;
  const res = emptyResult();

  for (const { row, data } of rows) {
    const name = getField(data, ...PROJECT_NAME_ALIASES);
    const donor = getField(data, "Donor / Finanțator", "donor", "Donor", "Finanțator");
    const payerName = getField(data, ...PAYER_ALIASES);

    if (!name) {
      res.errors.push({ row, column: "Denumire proiect", message: "Câmpul 'Denumire proiect' este obligatoriu." });
      continue;
    }
    if (name.length > MAX_NAME_LEN) {
      res.errors.push({ row, column: "Denumire proiect", message: `Denumirea depășește ${MAX_NAME_LEN} de caractere.` });
      continue;
    }

    try {
      const payer = await resolvePayer(tenantId, payerName);
      if (!payer) {
        res.errors.push({ row, column: "Plătitor / Organizație", message: payerName ? `Plătitorul '${payerName}' nu există.` : "Nu există un plătitor implicit. Adaugă foaia 'Plătitori'." });
        continue;
      }
      if (!(await mayAccessPayer(ctx.userId, tenantId, payer.id, ctx.role))) {
        res.errors.push({ row, column: "Plătitor / Organizație", message: `Nu ai acces la plătitorul '${payerName}'.` });
        continue;
      }

      // Upsert by name within tenant + payer
      const [existing] = await db
        .select({ id: parProjects.id })
        .from(parProjects)
        .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.payerId, payer.id), eq(parProjects.name, name)));

      if (existing) {
        await db
          .update(parProjects)
          .set({ donor: donor || null, payerId: payer.id, active: true, updatedAt: new Date() })
          .where(and(eq(parProjects.id, existing.id), eq(parProjects.tenantId, tenantId)));
        res.updated++;
      } else {
        await db.insert(parProjects).values({ tenantId, name, donor: donor || null, payerId: payer.id });
        res.created++;
      }
    } catch (err) {
      res.errors.push({ row, column: "Denumire proiect", message: rowFailure(err) });
    }
  }

  return res;
}

async function upsertDepartments(tenantId: string, rows: ImportRow[]): Promise<CategoryResult> {
  const res = emptyResult();

  for (const { row, data } of rows) {
    const name = getField(data, ...DEPARTMENT_NAME_ALIASES);

    if (!name) {
      res.errors.push({ row, column: "Denumire departament", message: "Câmpul 'Denumire departament' este obligatoriu." });
      continue;
    }
    if (name.length > MAX_NAME_LEN) {
      res.errors.push({ row, column: "Denumire departament", message: `Denumirea depășește ${MAX_NAME_LEN} de caractere.` });
      continue;
    }

    try {
      const [existing] = await db
        .select({ id: parDepartments.id })
        .from(parDepartments)
        .where(and(eq(parDepartments.tenantId, tenantId), eq(parDepartments.name, name)));

      if (existing) {
        await db
          .update(parDepartments)
          .set({ active: true, updatedAt: new Date() })
          .where(and(eq(parDepartments.id, existing.id), eq(parDepartments.tenantId, tenantId)));
        res.updated++;
      } else {
        await db.insert(parDepartments).values({ tenantId, name });
        res.created++;
      }
    } catch (err) {
      res.errors.push({ row, column: "Denumire departament", message: rowFailure(err) });
    }
  }

  return res;
}

async function upsertBudgetCodes(
  ctx: ImportCtx,
  rows: ImportRow[],
  /** Projects created on the fly from a budget-code row are counted here. */
  projectResult: CategoryResult
): Promise<CategoryResult> {
  const { tenantId } = ctx;
  const res = emptyResult();

  for (const { row, data } of rows) {
    const rawCode = getField(data, ...CODE_ALIASES);
    const rawName = getField(data, ...NAME_ALIASES);
    // Real files put the whole label in the "Cod" column ("1.1 Project Coordinator (100%)").
    const { code, name } = splitCodeAndName(rawCode, rawName);
    const allocatedRaw = getField(data, ...ALLOCATED_ALIASES);
    const payerName = getField(data, ...PAYER_ALIASES);
    const projectName = getField(data, ...PROJECT_ALIASES);

    if (!code) {
      res.errors.push({ row, column: "Cod buget", message: "Câmpul 'Cod buget' este obligatoriu." });
      continue;
    }
    if (code.length > MAX_CODE_LEN) {
      res.errors.push({
        row,
        column: "Cod buget",
        message: `Codul '${code.slice(0, 30)}…' are ${code.length} caractere (maxim ${MAX_CODE_LEN}). Pune doar codul în coloana „Cod" și denumirea în „Denumire".`,
      });
      continue;
    }
    if (!name) {
      res.errors.push({ row, column: "Denumire", message: "Câmpul 'Denumire' este obligatoriu." });
      continue;
    }

    try {
      const payer = await resolvePayer(tenantId, payerName);
      if (!payer) {
        res.errors.push({ row, column: "Plătitor / Organizație", message: payerName ? `Plătitorul '${payerName}' nu există.` : "Nu există un plătitor implicit." });
        continue;
      }
      if (!(await mayAccessPayer(ctx.userId, tenantId, payer.id, ctx.role))) {
        res.errors.push({ row, column: "Plătitor / Organizație", message: `Nu ai acces la plătitorul '${payerName}'.` });
        continue;
      }

      // The sheet may name a project that doesn't exist yet (this is how a grant budget
      // arrives: one file, project name repeated on every line). Create it once.
      let projectId: string | null = null;
      if (projectName) {
        if (projectName.length > MAX_NAME_LEN) {
          res.errors.push({ row, column: "Proiect", message: `Denumirea proiectului depășește ${MAX_NAME_LEN} de caractere.` });
          continue;
        }
        const [project] = await db.select({ id: parProjects.id }).from(parProjects).where(and(
          eq(parProjects.tenantId, tenantId), eq(parProjects.payerId, payer.id), eq(parProjects.name, projectName),
        ));
        if (project) {
          projectId = project.id;
        } else {
          const [created] = await db.insert(parProjects).values({ tenantId, name: projectName, payerId: payer.id }).returning({ id: parProjects.id });
          projectId = created.id;
          projectResult.created++;
        }
      }

      // Parse optional sum (MDL → cents).
      // Handles Romanian/European numeric formats: "45,000" = 45000, "45.50" = 45.5, "1.234,56" = 1234.56
      let allocatedCents = 0;
      if (allocatedRaw) {
        const parsed = parseMdlAmount(allocatedRaw);
        if (parsed === null) {
          res.errors.push({ row, column: "Suma alocată (MDL)", message: `Suma '${allocatedRaw}' nu este un număr valid.` });
          continue;
        }
        allocatedCents = Math.round(parsed * 100);
      }

      const storedName = name.slice(0, MAX_NAME_LEN);

      const [existing] = await db
        .select({ id: parBudgetCodes.id })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.payerId, payer.id), eq(parBudgetCodes.code, code)));

      if (existing) {
        await db
          .update(parBudgetCodes)
          .set({ name: storedName, payerId: payer.id, projectId, allocatedCents, active: true, updatedAt: new Date() })
          .where(and(eq(parBudgetCodes.id, existing.id), eq(parBudgetCodes.tenantId, tenantId)));
        res.updated++;
      } else {
        await db.insert(parBudgetCodes).values({ tenantId, payerId: payer.id, projectId, code, name: storedName, allocatedCents, active: true });
        res.created++;
      }
    } catch (err) {
      res.errors.push({ row, column: "Cod buget", message: rowFailure(err) });
    }
  }

  return res;
}
