/**
 * Regresie: un total peste mai multe cereri se adună DOAR în lei.
 *
 * Foaia „Rezumat" aduna `totalEstimatedCents` direct, adică dolari peste lei într-o singură
 * celulă intitulată „Total" — 1.500 USD intrau ca 1.500 lei într-un raport pe care se iau
 * decizii de buget (ATIC, PAR-2026-0027).
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildParWorkbook, type ExcelParRow } from "../excelExport";

function row(over: Partial<ExcelParRow>): ExcelParRow {
  return {
    requestNo: "PAR-2026-0001",
    dateOfRequest: "2026-09-01",
    requestorName: "Ana Chirita",
    departmentName: "ATIC Tekwill",
    projectName: "Talenati",
    budgetCode: "BC-1",
    purpose: "execute_payment",
    chargeTo: "project",
    status: "paid",
    totalEstimatedCents: 100000,
    currency: "MDL",
    totalMdlCents: null,
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    ...over,
  };
}

async function load(pars: ExcelParRow[]) {
  const buf = await buildParWorkbook({ orgName: "ATIC", pars, lines: [] });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("exportul Excel — moneda", () => {
  it("agregă echivalentul MDL, nu suma nativă, pentru o cerere în valută", async () => {
    const wb = await load([
      row({ requestNo: "PAR-2026-0026", totalEstimatedCents: 100000, currency: "MDL" }),
      // 1.500 USD ≈ 25.858,20 MDL la cursul fixat la depunere.
      row({ requestNo: "PAR-2026-0027", totalEstimatedCents: 150000, currency: "USD", totalMdlCents: 2585820 }),
    ]);

    const sum = wb.getWorksheet("Rezumat")!;
    let grand: number | null = null;
    sum.eachRow((r) => {
      if (String(r.getCell(1).value ?? "") === "TOTAL GENERAL") grand = Number(r.getCell(3).value);
    });

    // Greșit ar fi (100000 + 150000) / 100 = 2 500.
    expect(grand).toBe((100000 + 2585820) / 100);
  });

  it("scrie pe fiecare rând suma nativă, moneda ei și echivalentul în lei", async () => {
    const wb = await load([
      row({ requestNo: "PAR-2026-0027", totalEstimatedCents: 150000, currency: "USD", totalMdlCents: 2585820 }),
    ]);

    const req = wb.getWorksheet("Cereri")!;
    const header = req.getRow(1).values as unknown[];
    expect(header).toContain("Monedă");
    expect(header).toContain("Total (MDL)");

    const data = req.getRow(2);
    expect(Number(data.getCell(10).value)).toBe(1500);   // Total, în moneda cererii
    expect(String(data.getCell(11).value)).toBe("USD");  // Monedă
    expect(Number(data.getCell(12).value)).toBe(25858.2); // Total (MDL)
  });

  it("pentru o cerere în lei, echivalentul e chiar suma ei", async () => {
    const wb = await load([row({ totalEstimatedCents: 700000, currency: "MDL", totalMdlCents: null })]);
    const data = wb.getWorksheet("Cereri")!.getRow(2);
    expect(Number(data.getCell(12).value)).toBe(7000);
  });
});
