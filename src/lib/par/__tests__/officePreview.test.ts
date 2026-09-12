/**
 * officePreview — Word și Excel citite în browser, fără să atingă fișierul.
 *
 * Tests:
 *   - `previewKind` recunoaște docx/xlsx după MIME ȘI după extensie (octet-stream e frecvent)
 *   - formatele binare vechi (.doc/.xls/.ppt) și .pptx rămân pe descărcare, nu promit ce nu pot
 *   - un registru real: celule îmbinate, aldine, numere, formule, date calendaristice
 *   - foile ascunse nu apar în previzualizare
 *   - o foaie uriașă e tăiată la plafon și o SPUNE (`truncated`), ca omul să nu creadă că a văzut tot
 *
 * Rulează pe `node`, nu pe jsdom: `Blob.arrayBuffer()` există în toate browserele din 2020, dar
 * lipsește din implementarea de Blob a jsdom-ului, deci suita implicită ar pica pe un detaliu de
 * mediu de test, nu pe cod.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { previewKind, readXlsxSheets, XLSX_MAX_ROWS } from "../officePreview";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function workbookBlob(build: (wb: ExcelJS.Workbook) => void): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

describe("previewKind", () => {
  it("recunoaște Word și Excel după MIME", () => {
    expect(previewKind(DOCX_MIME, "contract.docx")).toBe("docx");
    expect(previewKind(XLSX_MIME, "deviz.xlsx")).toBe("xlsx");
  });

  // Browserele trimit des `application/octet-stream` pentru fișiere Office. Dacă ne-am uita doar
  // la MIME, un deviz perfect randabil ar ajunge pe butonul de descărcare.
  it("recunoaște Word și Excel după extensie când MIME-ul e generic", () => {
    expect(previewKind("application/octet-stream", "PAR_IPTekwill_TA_01.xlsx")).toBe("xlsx");
    expect(previewKind("application/octet-stream", "Act de predare-primire.DOCX")).toBe("docx");
  });

  it("păstrează PDF-ul și imaginile pe drumurile lor existente", () => {
    expect(previewKind("application/pdf", "factura.pdf")).toBe("pdf");
    expect(previewKind("image/png", "bon.png")).toBe("image");
    expect(previewKind("application/octet-stream", "bon.jpeg")).toBe("image");
  });

  // Uploadul acceptă formatele vechi (server/routes/parAttachments.ts), dar nicio bibliotecă de
  // browser nu le citește. `none` = butonul de descărcare, adică singurul lucru onest.
  it("lasă formatele binare vechi și prezentările pe descărcare", () => {
    expect(previewKind("application/msword", "adresa.doc")).toBe("none");
    expect(previewKind("application/vnd.ms-excel", "buget.xls")).toBe("none");
    expect(previewKind("application/vnd.ms-powerpoint", "prezentare.ppt")).toBe("none");
    expect(
      previewKind("application/vnd.openxmlformats-officedocument.presentationml.presentation", "p.pptx"),
    ).toBe("none");
  });
});

describe("readXlsxSheets", () => {
  it("citește un deviz real: îmbinări, aldine, numere, formule și date", async () => {
    const blob = await workbookBlob((wb) => {
      const ws = wb.addWorksheet("Deviz");
      ws.mergeCells("A1:C1");
      ws.getCell("A1").value = "Deviz de cheltuieli";
      ws.getCell("A1").font = { bold: true };
      ws.addRow(["Articol", "Cantitate", "Preț"]);
      ws.addRow(["Traduceri", 3, 1234.5]);
      ws.addRow(["Data", new Date(Date.UTC(2026, 8, 7, 12)), null]);
      ws.addRow(["Total", { formula: "B3*C3", result: 3703.5 }, null]);
    });

    const [sheet] = await readXlsxSheets(blob);
    expect(sheet.name).toBe("Deviz");
    expect(sheet.truncated).toBe(false);

    // Titlul îmbinat ocupă un singur `<td>` întins pe 3 coloane — nu trei celule cu același text,
    // care ar împinge tot rândul la dreapta.
    expect(sheet.rows[0]).toHaveLength(1);
    expect(sheet.rows[0][0]).toMatchObject({ text: "Deviz de cheltuieli", colSpan: 3, bold: true });

    expect(sheet.rows[1].map((c) => c.text)).toEqual(["Articol", "Cantitate", "Preț"]);

    // Numerele rămân exact ca în fișier (fără separatori inventați) și se aliniază la dreapta.
    expect(sheet.rows[2].map((c) => c.text)).toEqual(["Traduceri", "3", "1234.5"]);
    expect(sheet.rows[2][2].numeric).toBe(true);
    expect(sheet.rows[2][0].numeric).toBe(false);

    // `cell.text` întoarce pentru date `Date.toString()` întreg — de aia le formatăm noi.
    expect(sheet.rows[3][1].text).toBe("07.09.2026");

    // Formula se afișează cu rezultatul ei, nu cu „=B3*C3".
    expect(sheet.rows[4][1].text).toBe("3703.5");
  });

  it("sare peste foile ascunse", async () => {
    const blob = await workbookBlob((wb) => {
      wb.addWorksheet("Vizibilă").addRow(["a"]);
      wb.addWorksheet("Calcule", { state: "hidden" }).addRow(["secret"]);
    });

    const sheets = await readXlsxSheets(blob);
    expect(sheets.map((s) => s.name)).toEqual(["Vizibilă"]);
  });

  it("taie foile uriașe la plafon și marchează tăierea", async () => {
    const blob = await workbookBlob((wb) => {
      const ws = wb.addWorksheet("Mare");
      for (let i = 0; i < XLSX_MAX_ROWS + 120; i += 1) ws.addRow([`rând ${i}`]);
    });

    const [sheet] = await readXlsxSheets(blob);
    expect(sheet.rows).toHaveLength(XLSX_MAX_ROWS);
    expect(sheet.truncated).toBe(true);
  });

  // `actualColumnCount` numără și coloanele doar formatate: un fișier real de 5 coloane raporta 14
  // și se randa cu 9 coloane de celule goale după el.
  it("taie coloanele goale de la coada foii, dar păstrează întinderea îmbinărilor", async () => {
    const blob = await workbookBlob((wb) => {
      const ws = wb.addWorksheet("Meniu");
      ws.mergeCells("A1:D1");
      ws.getCell("A1").value = "4.07.2026 — 12 persoane";
      ws.addRow(["Produs", "gramaj", "cantitate", "preț"]);
      ws.addRow(["Salată", "150 g", 12, 45]);
      // Coloane doar formatate, fără conținut — exact ce umfla tabelul.
      for (const address of ["K1", "L1", "N3"]) ws.getCell(address).border = { top: { style: "thin" } };
    });

    const [sheet] = await readXlsxSheets(blob);
    expect(sheet.rows[1].map((c) => c.text)).toEqual(["Produs", "gramaj", "cantitate", "preț"]);
    expect(sheet.rows[2]).toHaveLength(4);
    // Titlul îmbinat pe A1:D1 rămâne întins pe toate cele 4 coloane păstrate.
    expect(sheet.rows[0][0].colSpan).toBe(4);
  });

  it("nu lasă rânduri goale la coada previzualizării", async () => {
    const blob = await workbookBlob((wb) => {
      const ws = wb.addWorksheet("Coadă");
      ws.addRow(["conținut"]);
      ws.getCell("A20").value = null;
    });

    const [sheet] = await readXlsxSheets(blob);
    expect(sheet.rows).toHaveLength(1);
  });
});
