/**
 * @vitest-environment node
 *
 * Regression for the 2026-08-25 live bug: LED.xlsx (a real grant budget uploaded by a client)
 * imported ZERO budget codes and silently created one project 41 times.
 *
 * The file: a single worksheet named "Sheet1", header row `Cod | Denumire | Denumire proiect`,
 * where the "Cod" cell holds the whole label ("4.2.6.3 Logistic support national makeathon
 * (transportation, accomodation, refreshments, materials)" — 100 chars, code column is varchar(50)).
 *
 * These tests build that exact workbook in memory. On the old code the sheet was found only by
 * name ("Coduri buget") or position (index 2), so `classify` returns nothing for it — which is
 * why the codes vanished with a 200 and no error.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  FIELD_DEFS,
  applyMapping,
  classifyWorkbook,
  detectKindFromHeaders,
  detectKindFromName,
  getField,
  normalizeHeader,
  parseMdlAmount,
  splitCodeAndName,
  suggestMapping,
} from "../configImportSheets";

/** Rebuilds the shape of the real LED.xlsx. */
async function ledWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Cod", "Denumire", "Denumire proiect"]);
  const lines = [
    "1.1 Director/Project Manager (50%)",
    "1.2 Project Coordinator (100%)",
    "4.2.6.3 Logistic support national makeathon (transportation, accomodation, refreshments, materials)",
    "6.3 Banking fees LED 0.05 prc",
  ];
  for (const label of lines) ws.addRow([label, label, "LED 3/Youth Maker club"]);
  return wb;
}

/** The workbook GET /template hands out — must keep working after the detector change. */
function templateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const p = wb.addWorksheet("Plătitori");
  p.addRow(["Denumire plătitor *", "Denumire juridică", "IDNO"]);
  p.addRow(["ATIC", "A.O. ATIC", "1010600000000"]);
  const pr = wb.addWorksheet("Proiecte");
  pr.addRow(["Denumire proiect *", "Donor / Finanțator", "Plătitor / Organizație *"]);
  pr.addRow(["LED 3", "SDC", "ATIC"]);
  const d = wb.addWorksheet("Departamente");
  d.addRow(["Denumire departament *"]);
  d.addRow(["Programe"]);
  const b = wb.addWorksheet("Coduri buget");
  b.addRow(["Cod buget *", "Denumire *", "Suma alocată (MDL)", "Plătitor / Organizație *", "Proiect (opțional)"]);
  b.addRow(["1.1", "Director", "45 000,50", "ATIC", "LED 3"]);
  return wb;
}

describe("normalizeHeader", () => {
  it("folds diacritics, case and the required-marker into one key", () => {
    expect(normalizeHeader("Suma alocată (MDL)")).toBe("suma alocata mdl");
    expect(normalizeHeader("Plătitor / Organizație *")).toBe("platitor organizatie");
    expect(normalizeHeader("Cod buget *")).toBe("cod buget");
    expect(normalizeHeader("  COD  ")).toBe("cod");
  });
});

describe("detectKindFromHeaders", () => {
  it("[blocant] reads the LED.xlsx header row as budget codes, not projects", () => {
    // The bug: this sheet ALSO has "Denumire proiect", and the old importer (position 0 =
    // "Proiecte") took it as a projects sheet.
    expect(detectKindFromHeaders(["Cod", "Denumire", "Denumire proiect"])).toBe("budgetCodes");
  });

  it("keeps the template's four sheets on their own kinds", () => {
    expect(detectKindFromHeaders(["Denumire plătitor *", "Denumire juridică", "IDNO"])).toBe("payers");
    expect(detectKindFromHeaders(["Denumire proiect *", "Donor / Finanțator", "Plătitor / Organizație *"])).toBe("projects");
    expect(detectKindFromHeaders(["Denumire departament *"])).toBe("departments");
    expect(detectKindFromHeaders(["Cod buget *", "Denumire *", "Suma alocată (MDL)", "Plătitor / Organizație *", "Proiect (opțional)"])).toBe("budgetCodes");
  });

  it("does not mistake a payer's fiscal code column for a budget code column", () => {
    expect(detectKindFromHeaders(["Denumire plătitor", "Cod fiscal"])).toBe("payers");
  });

  it("returns null when the headers say nothing", () => {
    expect(detectKindFromHeaders(["Coloana 1", "Coloana 2"])).toBeNull();
    expect(detectKindFromHeaders([])).toBeNull();
  });
});

describe("detectKindFromName", () => {
  it("still recognises the template sheet names", () => {
    expect(detectKindFromName("Coduri buget")).toBe("budgetCodes");
    expect(detectKindFromName("Departamente")).toBe("departments");
    expect(detectKindFromName("Proiecte")).toBe("projects");
    expect(detectKindFromName("Plătitori")).toBe("payers");
  });

  it("gives up on 'Sheet1' — which is exactly why headers are checked first", () => {
    expect(detectKindFromName("Sheet1")).toBeNull();
  });
});

describe("classifyWorkbook", () => {
  it("[blocant] classifies the real LED.xlsx single sheet as budget codes with all its rows", async () => {
    const sheets = classifyWorkbook(await ledWorkbook());
    expect(sheets).toHaveLength(1);
    expect(sheets[0].kind).toBe("budgetCodes");
    expect(sheets[0].via).toBe("headers");
    expect(sheets[0].rows).toHaveLength(4);
    // Row numbers are the real Excel ones, so an error message points at the right line.
    expect(sheets[0].rows[0].row).toBe(2);
    expect(getField(sheets[0].rows[0].data, "cod")).toBe("1.1 Director/Project Manager (50%)");
    expect(getField(sheets[0].rows[0].data, "denumire proiect")).toBe("LED 3/Youth Maker club");
  });

  it("[blocant] never treats a one-sheet file as the positional 'Proiecte' sheet", async () => {
    const sheets = classifyWorkbook(await ledWorkbook());
    expect(sheets.filter((s) => s.kind === "projects")).toHaveLength(0);
  });

  it("classifies every sheet of the downloadable template", () => {
    const sheets = classifyWorkbook(templateWorkbook());
    expect(sheets.map((s) => s.kind)).toEqual(["payers", "projects", "departments", "budgetCodes"]);
  });

  it("falls back to legacy positions only when NOTHING in the file is recognisable", () => {
    const wb = new ExcelJS.Workbook();
    for (const n of ["A", "B", "C"]) {
      const ws = wb.addWorksheet(n);
      ws.addRow(["Col1", "Col2"]);
      ws.addRow(["x", "y"]);
    }
    const sheets = classifyWorkbook(wb);
    expect(sheets.map((s) => s.kind)).toEqual(["projects", "departments", "budgetCodes"]);
    expect(sheets[0].via).toBe("position");
  });

  it("leaves an unrecognisable single sheet unclassified (the caller turns that into an error)", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Foaie");
    ws.addRow(["Col1", "Col2"]);
    ws.addRow(["x", "y"]);
    expect(classifyWorkbook(wb)[0].kind).toBeNull();
  });

  it("drops fully blank data rows that real files carry as formatting leftovers", async () => {
    const wb = await ledWorkbook();
    const ws = wb.getWorksheet("Sheet1")!;
    ws.addRow(["", "", ""]);
    ws.getRow(ws.rowCount).getCell(1).border = { top: { style: "thin" } };
    expect(classifyWorkbook(wb)[0].rows).toHaveLength(4);
  });
});

describe("splitCodeAndName", () => {
  it("[blocant] splits a Cod cell that carries the whole label (LED.xlsx shape)", () => {
    expect(splitCodeAndName("1.1 Director/Project Manager (50%)", "1.1 Director/Project Manager (50%)")).toEqual({
      code: "1.1",
      name: "Director/Project Manager (50%)",
    });
  });

  it("[blocant] keeps the code under the varchar(50) DB limit for the longest real line", () => {
    const label = "4.2.6.3 Logistic support national makeathon (transportation, accomodation, refreshments, materials)";
    const { code, name } = splitCodeAndName(label, label);
    expect(code).toBe("4.2.6.3");
    expect(code.length).toBeLessThanOrEqual(50);
    expect(name).toBe("Logistic support national makeathon (transportation, accomodation, refreshments, materials)");
  });

  it("leaves a clean code/name pair alone", () => {
    expect(splitCodeAndName("2.1", "Office supplies")).toEqual({ code: "2.1", name: "Office supplies" });
  });

  it("drops a code duplicated at the start of the name", () => {
    expect(splitCodeAndName("2.1", "2.1 Office supplies")).toEqual({ code: "2.1", name: "Office supplies" });
  });

  it("uses the label from the code cell when the name column is empty", () => {
    expect(splitCodeAndName("6.2 Audit services", "")).toEqual({ code: "6.2", name: "Audit services" });
  });

  it("does not invent a name when there is none", () => {
    expect(splitCodeAndName("6.2", "")).toEqual({ code: "6.2", name: "" });
  });

  it("handles letter-prefixed and dash codes", () => {
    expect(splitCodeAndName("A1.2 Salarii", "")).toEqual({ code: "A1.2", name: "Salarii" });
    expect(splitCodeAndName("3-4 Transport", "")).toEqual({ code: "3-4", name: "Transport" });
  });
});

describe("parseMdlAmount", () => {
  it("reads MD/EU and international formats", () => {
    expect(parseMdlAmount("45 000,50")).toBe(45000.5);
    expect(parseMdlAmount("1.234,56")).toBe(1234.56);
    expect(parseMdlAmount("1,234.56")).toBe(1234.56);
    expect(parseMdlAmount("45,000")).toBe(45000);
    expect(parseMdlAmount("45.50")).toBe(45.5);
    expect(parseMdlAmount("45000 MDL")).toBe(45000);
  });

  it("returns null for text", () => {
    expect(parseMdlAmount("n/a")).toBeNull();
    expect(parseMdlAmount("")).toBeNull();
  });
});

describe("suggestMapping — what the mapping dialog pre-selects", () => {
  it("pre-fills the LED.xlsx columns without stealing one column for two fields", () => {
    const m = suggestMapping("budgetCodes", ["Cod", "Denumire", "Denumire proiect"]);
    expect(m).toEqual({
      code: "Cod",
      name: "Denumire",
      allocated: null,
      project: "Denumire proiect",
      payer: null,
    });
  });

  it("uses the kind's own name aliases (a payers sheet's 'Denumire' is its name)", () => {
    expect(suggestMapping("payers", ["Denumire", "IDNO"])).toEqual({
      name: "Denumire",
      legalName: null,
      idno: "IDNO",
    });
  });

  it("suggests nothing when no column matches — the user picks by hand", () => {
    const m = suggestMapping("budgetCodes", ["Coloana A", "Coloana B"]);
    expect(Object.values(m).every((v) => v === null)).toBe(true);
  });

  it("every kind declares at least one required field", () => {
    for (const defs of Object.values(FIELD_DEFS)) {
      expect(defs.some((f) => f.required)).toBe(true);
    }
  });
});

describe("applyMapping — the user's choice replaces the file's headers", () => {
  const rows = [{ row: 2, data: { Cod: "1.1 Director", Denumire: "1.1 Director", "Denumire proiect": "LED 3" } }];

  it("rewrites row keys to the canonical field names", () => {
    expect(applyMapping(rows, { code: "Cod", name: "Denumire", project: "Denumire proiect" })).toEqual([
      { row: 2, data: { code: "1.1 Director", name: "1.1 Director", project: "LED 3" } },
    ]);
  });

  it("drops columns the user left unmapped", () => {
    const [mapped] = applyMapping(rows, { code: "Cod", name: null, project: null });
    expect(mapped.data).toEqual({ code: "1.1 Director" });
  });

  it("honours a deliberately unusual choice (name taken from the project column)", () => {
    const [mapped] = applyMapping(rows, { code: "Cod", name: "Denumire proiect" });
    expect(mapped.data).toEqual({ code: "1.1 Director", name: "LED 3" });
  });

  it("yields an empty string for a header that isn't in the row", () => {
    const [mapped] = applyMapping(rows, { code: "Cod", allocated: "Sumă" });
    expect(mapped.data.allocated).toBe("");
  });
});
