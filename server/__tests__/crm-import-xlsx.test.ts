/**
 * @vitest-environment node
 * IMPORT DIN REGISTRU EXCEL — cerința 1 din caietul de sarcini („Import masiv de companii din
 * fișiere Excel/CSV").
 *
 * Testul construiește un `.xlsx` REAL cu exceljs și îl trece prin parserul de import. Un test cu
 * un fișier inventat ar verifica doar că funcția nu aruncă; ăsta verifică că fișierul pe care
 * ți-l dă Excel-ul chiar se citește.
 *
 * `exceljs` era deja în repo (DocMerge) — cerința s-a închis fără nicio dependință nouă, și fără
 * SheetJS, care are istoric de vulnerabilități.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseWorkbookTable, applyMapping, suggestMapping } from "../lib/crm/importFile";

async function makeWorkbook(rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Leaduri");
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Citirea unui registru Excel", () => {
  it("[blocant] antetul și rândurile ies exact ca dintr-un CSV", async () => {
    const buf = await makeWorkbook([
      ["Nume", "Telefon", "Email", "Companie"],
      ["Primăria Ialoveni", "069123456", "contact@ialoveni.md", "Primăria Ialoveni"],
      ["Ion Rusu", "078111222", "ion@example.md", "Rusu SRL"],
    ]);

    const table = await parseWorkbookTable(buf);

    expect(table.headers).toEqual(["Nume", "Telefon", "Email", "Companie"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual(["Primăria Ialoveni", "069123456", "contact@ialoveni.md", "Primăria Ialoveni"]);
  });

  it("[blocant] maparea automată funcționează la fel pe Excel ca pe CSV", async () => {
    const buf = await makeWorkbook([
      ["Nume", "Telefon", "Email"],
      ["Ana Pop", "069000111", "ana@example.md"],
    ]);

    const table = await parseWorkbookTable(buf);
    const mapping = suggestMapping(table.headers);
    const drafts = applyMapping(table.rows, mapping);

    // Draftul e în forma internă (snake_case), aceeași ca la CSV.
    expect(drafts[0].full_name).toBe("Ana Pop");
    expect(drafts[0].phone).toBe("069000111");
    expect(drafts[0].email).toBe("ana@example.md");
  });

  it("[blocant] rândurile goale de la final nu devin leaduri fantomă", async () => {
    const buf = await makeWorkbook([
      ["Nume", "Telefon"],
      ["Ana Pop", "069000111"],
      [null, null],
      ["", ""],
    ]);

    const table = await parseWorkbookTable(buf);
    expect(table.rows).toHaveLength(1);
  });

  it("[normal] numerele și datele ies ca text, nu ca „Mon Sep 14 2026”", async () => {
    const buf = await makeWorkbook([
      ["Nume", "Valoare", "Data"],
      ["Client cu cifre", 1500, new Date("2026-09-14T00:00:00.000Z")],
    ]);

    const table = await parseWorkbookTable(buf);
    expect(table.rows[0][1]).toBe("1500");
    // Data în formă ISO scurtă: comparabilă și citibilă, nu dependentă de limba serverului.
    expect(table.rows[0][2]).toBe("2026-09-14");
  });

  it("[normal] o foaie goală nu aruncă — dă un tabel gol", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Goală");
    const table = await parseWorkbookTable(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(table.headers).toEqual([]);
    expect(table.rows).toEqual([]);
  });
});
