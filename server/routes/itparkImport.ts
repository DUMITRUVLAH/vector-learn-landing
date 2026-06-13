/**
 * ITPARK-202: Import linii de venit (Anexa 3)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2 — import din clipboard (tab/;/,), CSV, din invoices
 *
 * Routes:
 *   POST /api/itpark/import/paste  — body: { engagementId, text } → { imported, errors }
 *   POST /api/itpark/import/csv    — body: { engagementId, csv }  → { imported, errors }
 *   POST /api/itpark/import/invoices — body: { engagementId } → importă din invoices.ts
 *                                      LIMITARE DOCUMENTATĂ: invoices.ts nu are caemCode/serviceDescription
 *                                      → liniile importate au caemCode="", UI avertizează.
 *
 * mount-exempt: mounted in server/app.ts as app.route("/api/itpark/import", itparkImportRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  itparkRevenueLines,
  itparkEngagements,
  itparkCaemCodes,
} from "../db/schema/itpark";
import { invoices, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireItparkRole } from "../lib/itparkAuth";

export const itparkImportRoutes = new Hono<{ Variables: AuthVariables }>();
itparkImportRoutes.use("*", requireAuth);

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ImportLineInput {
  clientName: string;
  documentRefs?: string;
  serviceDescription?: string;
  caemCode?: string;
  amountCents: number;
  month?: number | null;
}

export interface ImportResult {
  imported: number;
  errors: { row: number; message: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Verifică că engagement-ul aparține tenantului */
async function getEngagement(engagementId: string, tenantId: string) {
  return db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, tenantId)
    ),
  });
}

/** Determină isEligible din nomenclatorul CAEM (dacă codul e prezent și eligible) */
async function resolveEligibility(caemCode: string): Promise<boolean> {
  if (!caemCode) return false;
  const code = await db.query.itparkCaemCodes.findFirst({
    where: eq(itparkCaemCodes.code, caemCode),
  });
  return code?.eligible ?? false;
}

/**
 * Parsează sumă MDL → cents (half-up rounding).
 * Acceptă: "15.000,50" / "15 000,50" / "15000.50" / "15000,50" / "15,000.50"
 */
export function parseCents(raw: string): number {
  // Elimină spații și caractere nefolosibe
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return 0;

  // Detectăm dacă separatorul de zecimale e "," sau "."
  // Cazul: "15.000,50" → separator mii = ".", zecimale = ","
  // Cazul: "15,000.50" → separator mii = ",", zecimale = "."
  // Cazul: "15000.50" sau "15000,50" → fără separator de mii
  const hasCommaDecimal = /,\d{2}$/.test(s); // se termină cu ",XX"
  const hasDotDecimal = /\.\d{2}$/.test(s);   // se termină cu ".XX"

  if (hasCommaDecimal) {
    // "15.000,50" → eliminăm punctele (separator mii), înlocuim virgula cu punct
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDotDecimal) {
    // "15,000.50" sau "15000.50" → eliminăm virgulele (separator mii)
    s = s.replace(/,/g, "");
  } else {
    // Fără zecimale clare → tratăm ca număr întreg MDL
    s = s.replace(/[,\.]/g, "");
  }

  const num = parseFloat(s);
  if (isNaN(num) || num < 0) return 0;
  // Half-up rounding la 2 zecimale
  return Math.round(num * 100);
}

/**
 * Parsează o linie text (tab / ; / ,) și extrage câmpurile.
 * Coloane așteptate (în orice ordine, detectate automat după header sau poziție):
 *   pozițional: [clientName, documentRefs, serviceDescription, caemCode, amountMDL, month?]
 */
export function parseTextLine(
  raw: string,
  delimiter: string
): string[] {
  // Suport pentru câmpuri cu ghilimele duble (CSV standard)
  if (delimiter === ",") {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }
  return raw.split(delimiter).map((s) => s.trim());
}

/** Detectează delimiter din text (tab > ; > ,) */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  return ",";
}

/**
 * Header detection: returnează indexul fiecărei coloane cunoscute
 * (case-insensitive, diacritice tolerate).
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/[îi]/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .trim();
}

interface ColumnMap {
  clientName: number;
  documentRefs: number;
  serviceDescription: number;
  caemCode: number;
  amountCents: number;
  month: number;
}

function detectColumns(headers: string[]): ColumnMap {
  const norm = headers.map(normalizeHeader);
  const find = (keywords: string[]): number =>
    norm.findIndex((h) => keywords.some((kw) => h.includes(kw)));

  return {
    clientName:       find(["client", "beneficiar", "cumparator", "denumire"]),
    documentRefs:     find(["document", "factura", "invoice", "nr.", "ref"]),
    serviceDescription: find(["serviciu", "obiect", "descriere", "service"]),
    caemCode:         find(["caem", "cod caem", "cod activitate"]),
    amountCents:      find(["suma", "amount", "valoare", "mdl", "lei"]),
    month:            find(["luna", "month", "period"]),
  };
}

/**
 * Parsare text (clipboard/CSV) → linii de import.
 * Returnează { lines, errors }.
 */
export function parseTextToLines(text: string): {
  lines: ImportLineInput[];
  errors: { row: number; message: string }[];
} {
  const delim = detectDelimiter(text);
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return { lines: [], errors: [] };

  const lines: ImportLineInput[] = [];
  const errors: { row: number; message: string }[] = [];

  // Detectăm dacă primul rând e header
  const firstCells = parseTextLine(rawLines[0], delim);
  const colMap = detectColumns(firstCells);
  const hasHeader =
    colMap.clientName >= 0 ||
    colMap.amountCents >= 0 ||
    // Dacă prima celulă nu e un număr → presupunem că e header
    isNaN(parseCents(firstCells[0]));

  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
  // Coloane poziționale default (fără header detectat):
  // 0=client, 1=documente, 2=serviciu, 3=caem, 4=suma, 5=luna
  const defaultMap: ColumnMap = {
    clientName: 0,
    documentRefs: 1,
    serviceDescription: 2,
    caemCode: 3,
    amountCents: 4,
    month: 5,
  };
  const cm = colMap.clientName >= 0 ? colMap : defaultMap;

  dataLines.forEach((rawLine, idx) => {
    const rowNum = idx + (hasHeader ? 2 : 1);
    if (!rawLine.trim()) return;

    const cells = parseTextLine(rawLine, delim);

    const clientName = cm.clientName >= 0 ? (cells[cm.clientName] ?? "") : (cells[0] ?? "");
    const amountRaw = cm.amountCents >= 0 ? (cells[cm.amountCents] ?? "") : (cells[4] ?? "");
    const amountCents = parseCents(amountRaw);

    if (!clientName.trim()) {
      errors.push({ row: rowNum, message: "Denumire client lipsă" });
      return;
    }
    if (amountCents === 0 && amountRaw.trim() !== "0") {
      errors.push({ row: rowNum, message: `Suma invalidă: „${amountRaw}"` });
      return;
    }

    const monthRaw = cm.month >= 0 ? (cells[cm.month] ?? "") : (cells[5] ?? "");
    const monthNum = monthRaw ? parseInt(monthRaw, 10) : null;

    lines.push({
      clientName: clientName.trim(),
      documentRefs: cm.documentRefs >= 0 ? (cells[cm.documentRefs] ?? "").trim() || undefined : undefined,
      serviceDescription: cm.serviceDescription >= 0 ? (cells[cm.serviceDescription] ?? "").trim() : "",
      caemCode: cm.caemCode >= 0 ? (cells[cm.caemCode] ?? "").trim() : "",
      amountCents,
      month: monthNum && monthNum >= 1 && monthNum <= 12 ? monthNum : null,
    });
  });

  return { lines, errors };
}

/** Persistă liniile importate în DB (bulk insert) */
async function persistLines(
  engagementId: string,
  tenantId: string,
  lineInputs: ImportLineInput[],
  startRowNo: number
): Promise<number> {
  if (lineInputs.length === 0) return 0;

  // Obținem toate codurile CAEM o singură dată pentru eficiență
  const allCaem = await db
    .select()
    .from(itparkCaemCodes)
    .orderBy(asc(itparkCaemCodes.code));

  const caemMap = new Map(allCaem.map((c) => [c.code, c.eligible]));

  const rows = lineInputs.map((line, idx) => {
    const isEligible = line.caemCode
      ? (caemMap.get(line.caemCode) ?? false)
      : false;
    return {
      tenantId,
      engagementId,
      rowNo: startRowNo + idx,
      clientName: line.clientName,
      documentRefs: line.documentRefs ?? null,
      serviceDescription: line.serviceDescription ?? "",
      caemCode: line.caemCode ?? "",
      amountCents: line.amountCents,
      isEligible,
      month: line.month ?? null,
    };
  });

  await db.insert(itparkRevenueLines).values(rows);
  return rows.length;
}

// ─── POST /paste — import din clipboard ──────────────────────────────────

const pasteSchema = z.object({
  engagementId: z.string().uuid(),
  text: z.string().min(1),
});

itparkImportRoutes.post("/paste", zValidator("json", pasteSchema), async (c) => {
  const deny = await requireItparkRole("accountant", c);
  if (deny) return deny;

  const user = c.get("user");
  const { engagementId, text } = c.req.valid("json");

  const eng = await getEngagement(engagementId, user.tenantId);
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  // Obținem rowNo maxim curent
  const existingLines = await db
    .select()
    .from(itparkRevenueLines)
    .where(eq(itparkRevenueLines.engagementId, engagementId));
  const startRowNo = existingLines.length;

  const { lines, errors } = parseTextToLines(text);

  let imported = 0;
  try {
    imported = await persistLines(engagementId, user.tenantId, lines, startRowNo);
  } catch (e) {
    return c.json({
      error: "Eroare la salvare în baza de date",
      details: e instanceof Error ? e.message : String(e),
    }, 500);
  }

  return c.json({ imported, errors } satisfies ImportResult);
});

// ─── POST /csv — import din fișier CSV ──────────────────────────────────

const csvSchema = z.object({
  engagementId: z.string().uuid(),
  csv: z.string().min(1),
});

itparkImportRoutes.post("/csv", zValidator("json", csvSchema), async (c) => {
  const deny = await requireItparkRole("accountant", c);
  if (deny) return deny;

  const user = c.get("user");
  const { engagementId, csv } = c.req.valid("json");

  const eng = await getEngagement(engagementId, user.tenantId);
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  const existingLines = await db
    .select()
    .from(itparkRevenueLines)
    .where(eq(itparkRevenueLines.engagementId, engagementId));
  const startRowNo = existingLines.length;

  const { lines, errors } = parseTextToLines(csv);

  let imported = 0;
  if (lines.length > 0) {
    try {
      imported = await persistLines(engagementId, user.tenantId, lines, startRowNo);
    } catch (e) {
      return c.json({
        error: "Eroare la salvare în baza de date",
        details: e instanceof Error ? e.message : String(e),
      }, 500);
    }
  }

  return c.json({ imported, errors } satisfies ImportResult);
});

// ─── POST /invoices — import din invoices.ts ─────────────────────────────
// LIMITARE DOCUMENTATĂ: invoices.ts nu are câmpuri caemCode sau serviceDescription.
// Liniile importate vor avea caemCode="" și serviceDescription din notes/serie.
// UI-ul avertizează că liniile necesită cod CAEM.

const fromInvoicesSchema = z.object({
  engagementId: z.string().uuid(),
});

itparkImportRoutes.post(
  "/invoices",
  zValidator("json", fromInvoicesSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const { engagementId } = c.req.valid("json");

    const eng = await getEngagement(engagementId, user.tenantId);
    if (!eng) return c.json({ error: "engagement not found" }, 404);

    // Obținem facturile tenantului
    const tenantInvoices = await db
      .select({
        id: invoices.id,
        series: invoices.series,
        number: invoices.number,
        amountCents: invoices.amountCents,
        issueDate: invoices.issueDate,
        notes: invoices.notes,
        studentId: invoices.studentId,
      })
      .from(invoices)
      .where(eq(invoices.tenantId, user.tenantId));

    if (tenantInvoices.length === 0) {
      return c.json({
        imported: 0,
        errors: [],
        warning:
          "Nu există facturi în sistem pentru acest tenant. Importul din facturi necesită module FIN-601.",
      });
    }

    // Obținem studenții pentru a construi clientName
    const allStudents = await db
      .select({ id: students.id, name: students.fullName })
      .from(students)
      .where(eq(students.tenantId, user.tenantId));
    const studentMap = new Map(allStudents.map((s) => [s.id, s.name]));

    const existingLines = await db
      .select()
      .from(itparkRevenueLines)
      .where(eq(itparkRevenueLines.engagementId, engagementId));
    const startRowNo = existingLines.length;

    // Conversia facturilor → linii ITPARK (fără CAEM — limitare documentată)
    const lineInputs: ImportLineInput[] = tenantInvoices.map((inv) => {
      const clientName = inv.studentId
        ? (studentMap.get(inv.studentId) ?? `Student ${inv.studentId.slice(0, 8)}`)
        : "Client necunoscut";

      const issueDate = inv.issueDate
        ? new Date(inv.issueDate)
        : null;
      const month = issueDate ? issueDate.getMonth() + 1 : null;

      return {
        clientName,
        documentRefs: `${inv.series}${inv.number ?? ""}`,
        serviceDescription: inv.notes ?? "",
        caemCode: "", // LIMITARE: invoices.ts nu are câmp caemCode
        amountCents: inv.amountCents,
        month: month ?? null,
      };
    });

    let imported = 0;
    try {
      imported = await persistLines(engagementId, user.tenantId, lineInputs, startRowNo);
    } catch (e) {
      return c.json({
        error: "Eroare la salvare",
        details: e instanceof Error ? e.message : String(e),
      }, 500);
    }

    return c.json({
      imported,
      errors: [],
      warning:
        "Liniile importate din facturi nu au cod CAEM. Completați codul CAEM pentru fiecare linie pentru a calcula corect eligibilitatea.",
    } satisfies ImportResult & { warning: string });
  }
);
