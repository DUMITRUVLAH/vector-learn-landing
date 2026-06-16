/**
 * VF-201: build the PAR report as an .xlsx workbook (3 sheets).
 * Server-side only (exceljs is never imported into the client bundle).
 *
 * Sheets:
 *   1. Rezumat  — totals by status, department, budget code
 *   2. Cereri   — one row per PAR, names resolved (not UUIDs), amounts numeric
 *   3. Articole — line items with their PAR number
 */
import ExcelJS from "exceljs";

export interface ExcelParRow {
  requestNo: string;
  dateOfRequest: Date | string | null;
  requestorName: string | null;
  departmentName: string | null;
  projectName: string | null;
  budgetCode: string | null;
  purpose: string;
  chargeTo: string;
  status: string;
  totalEstimatedCents: number;
  currency: string;
  submittedAt: Date | string | null;
  approvedAt: Date | string | null;
  paidAt: Date | string | null;
}

export interface ExcelLineRow {
  requestNo: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
  currency: string;
}

const MONEY_FMT = "#,##0.00";
const DATE_FMT = "dd-mmm-yyyy";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE85D7C" }, // PAR pink
};

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
}

/** Auto-size columns to the widest cell (capped). */
function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });
}

export async function buildParWorkbook(params: {
  orgName: string;
  pars: ExcelParRow[];
  lines: ExcelLineRow[];
}): Promise<Buffer> {
  const { orgName, pars, lines } = params;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vector Finance";
  wb.created = new Date();

  // ── Sheet 1: Rezumat ──────────────────────────────────────────────────────
  const sum = wb.addWorksheet("Rezumat");
  sum.addRow([`Vector Finance — Raport PAR`]);
  sum.getRow(1).font = { bold: true, size: 14 };
  sum.addRow([orgName]);
  sum.addRow([`Generat: ${new Date().toLocaleString("ro-MD")}`]);
  sum.addRow([]);

  const agg = (key: (p: ExcelParRow) => string | null) => {
    const m = new Map<string, { count: number; cents: number }>();
    for (const p of pars) {
      const k = key(p) || "—";
      const cur = m.get(k) ?? { count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += p.totalEstimatedCents;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].cents - a[1].cents);
  };

  const addAggBlock = (title: string, rows: [string, { count: number; cents: number }][]) => {
    const h = sum.addRow([title, "Număr", "Total"]);
    styleHeader(h);
    for (const [label, v] of rows) {
      const r = sum.addRow([label, v.count, v.cents / 100]);
      r.getCell(3).numFmt = MONEY_FMT;
    }
    sum.addRow([]);
  };

  addAggBlock("Pe status", agg((p) => p.status));
  addAggBlock("Pe departament", agg((p) => p.departmentName));
  addAggBlock("Pe cod buget", agg((p) => p.budgetCode));
  const grand = pars.reduce((s, p) => s + p.totalEstimatedCents, 0);
  const totalRow = sum.addRow(["TOTAL GENERAL", pars.length, grand / 100]);
  totalRow.font = { bold: true };
  totalRow.getCell(3).numFmt = MONEY_FMT;
  autoWidth(sum);

  // ── Sheet 2: Cereri ───────────────────────────────────────────────────────
  const req = wb.addWorksheet("Cereri");
  const reqHeader = req.addRow([
    "Nr. cerere", "Data", "Solicitant", "Departament", "Proiect", "Cod buget",
    "Scop", "Charge to", "Status", "Total", "Monedă", "Depus", "Aprobat", "Plătit",
  ]);
  styleHeader(reqHeader);
  for (const p of pars) {
    const r = req.addRow([
      p.requestNo,
      toDate(p.dateOfRequest),
      p.requestorName ?? "",
      p.departmentName ?? "",
      p.projectName ?? "",
      p.budgetCode ?? "",
      p.purpose,
      p.chargeTo,
      p.status,
      p.totalEstimatedCents / 100,
      p.currency,
      toDate(p.submittedAt),
      toDate(p.approvedAt),
      toDate(p.paidAt),
    ]);
    r.getCell(2).numFmt = DATE_FMT;
    r.getCell(10).numFmt = MONEY_FMT;
    r.getCell(12).numFmt = DATE_FMT;
    r.getCell(13).numFmt = DATE_FMT;
    r.getCell(14).numFmt = DATE_FMT;
  }
  req.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(req);

  // ── Sheet 3: Articole ─────────────────────────────────────────────────────
  const items = wb.addWorksheet("Articole");
  const itemsHeader = items.addRow([
    "Nr. cerere", "Poziție", "Descriere", "Cantitate", "Unitate", "Preț unitar", "Total linie", "Monedă",
  ]);
  styleHeader(itemsHeader);
  for (const l of lines) {
    const r = items.addRow([
      l.requestNo, l.position, l.description, l.quantity, l.unit ?? "",
      l.unitPriceCents / 100, l.lineTotalCents / 100, l.currency,
    ]);
    r.getCell(6).numFmt = MONEY_FMT;
    r.getCell(7).numFmt = MONEY_FMT;
  }
  items.views = [{ state: "frozen", ySplit: 1 }];
  autoWidth(items);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
