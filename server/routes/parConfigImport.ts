/**
 * VM1-02: PAR Config Import — import projects, departments, and budget codes from Excel.
 *
 * Routes:
 *   GET  /api/par/config-import/template  — download the .xlsx template
 *   POST /api/par/config-import           — upload + parse + upsert (par_admin only)
 *
 * CRITICAL: exceljs MUST be imported dynamically (lazy) — a top-level import
 * caused a prod outage (whole API down). Pattern from server/lib/docmerge/excelImport.ts.
 *
 * Schema:
 *   Sheet 1 "Proiecte":       col A = name (req), col B = donor
 *   Sheet 2 "Departamente":   col A = name (req)
 *   Sheet 3 "Coduri buget":   col A = code (req, unique), col B = name (req), col C = suma (MDL)
 *
 * Validation:
 *   - Required fields missing → row skipped + reported as error
 *   - Budget code: duplicate code → update existing (upsert by code)
 *   - Project: upsert by name
 *   - Department: upsert by name
 */
import { Hono } from "hono";
import type ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parProjects, parDepartments, parBudgetCodes } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";

export const parConfigImportRoutes = new Hono<{ Variables: AuthVariables }>();
parConfigImportRoutes.use("*", requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportRow {
  row: number;
  data: Record<string, string>;
}

interface RowError {
  row: number;
  column: string;
  message: string;
}

interface ImportResult {
  projects: { created: number; updated: number; errors: RowError[] };
  departments: { created: number; updated: number; errors: RowError[] };
  budgetCodes: { created: number; updated: number; errors: RowError[] };
}

// ─── GET /template ────────────────────────────────────────────────────────────

/**
 * Returns a ready-made .xlsx template the par_admin can fill and upload.
 * Three worksheets: Proiecte, Departamente, Coduri buget.
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

    // Sheet 1: Projects
    const ws1 = wb.addWorksheet("Proiecte");
    ws1.columns = [
      { header: "Denumire proiect *", key: "name", width: 35 },
      { header: "Donor / Finanțator", key: "donor", width: 25 },
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
 * Returns { projects, departments, budgetCodes } each with created/updated/errors.
 */
parConfigImportRoutes.post(
  "/",
  requirePARRole("par_admin"),
  async (c) => {
    const tenantId = c.get("user").tenantId;

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

    // Parse sheets by name or position
    const projectRows = parseSheet(wb, "Proiecte", 0);
    const deptRows = parseSheet(wb, "Departamente", 1);
    const budgetRows = parseSheet(wb, "Coduri buget", 2);

    // Process each category
    const projectResult = await upsertProjects(tenantId, projectRows);
    const deptResult = await upsertDepartments(tenantId, deptRows);
    const budgetResult = await upsertBudgetCodes(tenantId, budgetRows);

    const result: ImportResult = {
      projects: projectResult,
      departments: deptResult,
      budgetCodes: budgetResult,
    };

    return c.json(result);
  }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract rows from a worksheet (by name first, then by index).
 * Row 1 = headers; rows 2..N = data.
 */
function parseSheet(
  wb: ExcelJS.Workbook,
  name: string,
  fallbackIndex: number
): ImportRow[] {
  const ws = wb.getWorksheet(name) ?? wb.worksheets[fallbackIndex];
  if (!ws) return [];

  const allRows: ExcelJS.Row[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => allRows.push(row));
  if (allRows.length < 2) return []; // header-only or empty

  const headerRow = allRows[0];
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell) =>
    headers.push(String(cell.value ?? "").trim())
  );

  return allRows.slice(1).map((row, idx) => {
    const data: Record<string, string> = {};
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      data[h] = cellToString(cell);
    });
    return { row: idx + 2, data }; // row index 1-based (row 1 = header)
  });
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in v) {
      return (v as { richText: { text: string }[] }).richText.map((rt) => rt.text).join("");
    }
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      return r !== null && r !== undefined ? String(r) : "";
    }
  }
  return String(v);
}

/**
 * Parse a Romanian/European MDL amount string → number (or null on error).
 * Handles: "45,000" (thousands) = 45000, "45.50" (decimal) = 45.5,
 *          "1.234,56" (EU thousands + decimal) = 1234.56, "45000" = 45000.
 */
function parseMdlAmount(raw: string): number | null {
  // Strip currency symbols and spaces
  let s = raw.replace(/[^\d.,]/g, "").trim();
  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Both separators: detect which is thousands vs decimal.
    // European: "1.234,56" → dot=thousands, comma=decimal
    // US: "1,234.56" → comma=thousands, dot=decimal
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // comma is decimal separator: "1.234,56" → strip dots, replace comma
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // dot is decimal separator: "1,234.56" → strip commas
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Only commas: could be thousands "45,000" or decimal "45,5"
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
      // "45,000" → thousands separator
      s = s.replace(",", "");
    } else {
      // "45,5" → decimal comma
      s = s.replace(",", ".");
    }
  } else if (hasDot && !hasComma) {
    // Only dots: could be thousands "1.234" or decimal "45.5"
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      // "1.234" → thousands, remove dot
      s = s.replace(".", "");
    }
    // "45.50" → normal decimal, keep as-is
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Case-insensitive key lookup in a row's data (handles column header variants) */
function getField(data: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    for (const [k, v] of Object.entries(data)) {
      if (k.toLowerCase().replace(/\s*\*\s*$/, "").trim() === key.toLowerCase()) {
        return v.trim();
      }
    }
  }
  return "";
}

// ─── Upsert functions ─────────────────────────────────────────────────────────

async function upsertProjects(
  tenantId: string,
  rows: ImportRow[]
): Promise<{ created: number; updated: number; errors: RowError[] }> {
  let created = 0;
  let updated = 0;
  const errors: RowError[] = [];

  for (const { row, data } of rows) {
    const name = getField(data, "Denumire proiect", "name");
    const donor = getField(data, "Donor / Finanțator", "donor", "Donor");

    if (!name) {
      errors.push({ row, column: "Denumire proiect", message: "Câmpul 'Denumire proiect' este obligatoriu." });
      continue;
    }

    // Upsert by name within tenant
    const [existing] = await db
      .select({ id: parProjects.id })
      .from(parProjects)
      .where(and(eq(parProjects.tenantId, tenantId), eq(parProjects.name, name)));

    if (existing) {
      await db
        .update(parProjects)
        .set({ donor: donor || null, active: true, updatedAt: new Date() })
        .where(and(eq(parProjects.id, existing.id), eq(parProjects.tenantId, tenantId)));
      updated++;
    } else {
      await db.insert(parProjects).values({ tenantId, name, donor: donor || null });
      created++;
    }
  }

  return { created, updated, errors };
}

async function upsertDepartments(
  tenantId: string,
  rows: ImportRow[]
): Promise<{ created: number; updated: number; errors: RowError[] }> {
  let created = 0;
  let updated = 0;
  const errors: RowError[] = [];

  for (const { row, data } of rows) {
    const name = getField(data, "Denumire departament", "name");

    if (!name) {
      errors.push({ row, column: "Denumire departament", message: "Câmpul 'Denumire departament' este obligatoriu." });
      continue;
    }

    const [existing] = await db
      .select({ id: parDepartments.id })
      .from(parDepartments)
      .where(and(eq(parDepartments.tenantId, tenantId), eq(parDepartments.name, name)));

    if (existing) {
      await db
        .update(parDepartments)
        .set({ active: true, updatedAt: new Date() })
        .where(and(eq(parDepartments.id, existing.id), eq(parDepartments.tenantId, tenantId)));
      updated++;
    } else {
      await db.insert(parDepartments).values({ tenantId, name });
      created++;
    }
  }

  return { created, updated, errors };
}

async function upsertBudgetCodes(
  tenantId: string,
  rows: ImportRow[]
): Promise<{ created: number; updated: number; errors: RowError[] }> {
  let created = 0;
  let updated = 0;
  const errors: RowError[] = [];

  for (const { row, data } of rows) {
    const code = getField(data, "Cod buget", "code");
    const name = getField(data, "Denumire", "name");
    const allocatedRaw = getField(data, "Suma alocată (MDL)", "Suma alocata (MDL)", "suma", "allocated");

    if (!code) {
      errors.push({ row, column: "Cod buget", message: "Câmpul 'Cod buget' este obligatoriu." });
      continue;
    }
    if (!name) {
      errors.push({ row, column: "Denumire", message: "Câmpul 'Denumire' este obligatoriu." });
      continue;
    }

    // Parse optional sum (MDL → cents).
    // Handles Romanian/European numeric formats: "45,000" = 45000, "45.50" = 45.5, "1.234,56" = 1234.56
    let allocatedCents = 0;
    if (allocatedRaw) {
      const parsed = parseMdlAmount(allocatedRaw);
      if (parsed === null) {
        errors.push({ row, column: "Suma alocată (MDL)", message: `Suma '${allocatedRaw}' nu este un număr valid.` });
        continue;
      }
      allocatedCents = Math.round(parsed * 100);
    }

    const [existing] = await db
      .select({ id: parBudgetCodes.id })
      .from(parBudgetCodes)
      .where(and(eq(parBudgetCodes.tenantId, tenantId), eq(parBudgetCodes.code, code)));

    if (existing) {
      await db
        .update(parBudgetCodes)
        .set({ name, allocatedCents, active: true, updatedAt: new Date() })
        .where(and(eq(parBudgetCodes.id, existing.id), eq(parBudgetCodes.tenantId, tenantId)));
      updated++;
    } else {
      await db.insert(parBudgetCodes).values({ tenantId, code, name, allocatedCents, active: true });
      created++;
    }
  }

  return { created, updated, errors };
}
