/**
 * FISC-003: Generator declarații fiscale — PDF + CSV
 *
 * Suportă:
 *   - TVA12-MD  : PDF + CSV pentru Republica Moldova (SFS)
 *   - D394-RO   : CSV compatibil ANAF (format informativ livrări/achiziții)
 *   - D301-RO   : CSV sumar ramburs TVA România
 *   - income_md : PDF sumar impozit pe venit Moldova
 *
 * PDF generat cu jsPDF în Node.js (text nativ, nu rasterizare — nu necesită browser/canvas).
 * CSV generat ca string UTF-8 cu BOM (pentru Excel România/Moldova).
 *
 * Nu se trimite automat la autorități — export pentru depunere manuală.
 * AI zero în generare.
 */

import { jsPDF } from "jspdf";
import type { FinTaxDeclaration, FinTaxPeriod } from "../../db/schema/finTax";

// Re-export types pentru a evita import circular în routes
export type { FinTaxDeclaration, FinTaxPeriod };

// ─── Payload type (stocat în fin_tax_declarations.payload) ───────────────────

export interface TaxPayload {
  vat_collected_cents?: number;
  vat_deductible_cents?: number;
  vat_due_cents?: number;
  income_tax_base_cents?: number;
  income_tax_cents?: number;
  income_tax_rate_pct?: number;
  vat_by_rate?: Record<string, { collectedCents: number; deductibleCents: number }>;
  invoice_count?: number;
  expense_count?: number;
  calculated_at?: string;
  // D394 specific
  invoice_lines?: Array<{
    supplier_cif?: string;
    supplier_name?: string;
    invoice_number?: string;
    invoice_date?: string;
    base_cents?: number;
    vat_cents?: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formatează cenți ca lei cu 2 zecimale (ex: 120050 → "1.200,50") */
function fmtLei(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const s = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (cents < 0 ? "-" : "") + s + "," + frac.toString().padStart(2, "0");
}

/** Returnează eticheta perioadei: "Ianuarie 2025" / "Q1 2025" / "2025" */
export function periodLabel(period: Pick<FinTaxPeriod, "periodType" | "year" | "month" | "quarter">): string {
  const MONTHS = [
    "", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
  ];
  if (period.periodType === "monthly" && period.month) {
    return `${MONTHS[period.month]} ${period.year}`;
  }
  if (period.periodType === "quarterly" && period.quarter) {
    return `T${period.quarter} ${period.year}`;
  }
  return `${period.year}`;
}

/** CSV UTF-8 cu BOM — compatibil Excel România/Moldova */
function csvWithBom(lines: string[]): string {
  return "﻿" + lines.join("\r\n");
}

/** Escape celulă CSV — înconjoară cu ghilimele dacă conține virgulă/ghilimele/newline */
function csvCell(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── PDF generators ───────────────────────────────────────────────────────────

/**
 * Generează PDF TVA12-MD (declarație lunară TVA, Republica Moldova, SFS).
 * Format A4 portrait, text nativ jsPDF.
 */
export function generateTva12MdPdf(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  payload: TaxPayload
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  let y = 20;

  // Header
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("REPUBLICA MOLDOVA — SERVICIUL FISCAL DE STAT", W / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARATIE TVA (Forma TVA12)", W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Perioada fiscala: ${periodLabel(period)}`, margin, y);
  y += 6;
  doc.text(`Nr. declaratiei: ${declaration.id.slice(0, 8).toUpperCase()}`, margin, y);
  y += 6;
  doc.text(`Data calculului: ${payload.calculated_at ? new Date(payload.calculated_at).toLocaleDateString("ro-MD") : "—"}`, margin, y);
  y += 10;

  // Separator
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // Table
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("INDICATOR", margin, y);
  doc.text("SUMA (MDL)", W - margin, y, { align: "right" });
  y += 5;
  doc.line(margin, y, W - margin, y);
  y += 5;

  doc.setFont("helvetica", "normal");

  const rows = [
    ["1. TVA colectat (livrarile impozabile)", payload.vat_collected_cents ?? 0],
    ["2. TVA deductibil (achizitii cu drept)", payload.vat_deductible_cents ?? 0],
    ["3. TVA de plata (rd. 1 - rd. 2)", payload.vat_due_cents ?? 0],
  ];

  for (const [label, cents] of rows) {
    const valStr = fmtLei(cents as number);
    doc.text(String(label), margin, y);
    doc.text(valStr, W - margin, y, { align: "right" });
    y += 7;
  }

  y += 3;
  doc.line(margin, y, W - margin, y);
  y += 8;

  // Impozit venit
  if (payload.income_tax_cents !== undefined) {
    doc.setFont("helvetica", "bold");
    doc.text("IMPOZIT PE VENIT", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(`Baza impozabila: ${fmtLei(payload.income_tax_base_cents ?? 0)} MDL`, margin, y);
    y += 6;
    doc.text(`Cota aplicata: ${payload.income_tax_rate_pct ?? 0}%`, margin, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(`Impozit pe venit: ${fmtLei(payload.income_tax_cents)} MDL`, margin, y);
    y += 10;
  }

  // Semnatura
  doc.line(margin, y, W - margin, y);
  y += 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Contabil autorizat: _________________________________", margin, y);
  y += 6;
  doc.text("Data depunerii: _______________   Stampila", margin, y);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    "Generat automat de Vector Learn FinDesk. Verificati datele inainte de depunere.",
    W / 2, y, { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Generează PDF impozit venit Moldova.
 */
export function generateIncomeMdPdf(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  payload: TaxPayload
): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const margin = 20;
  let y = 20;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("REPUBLICA MOLDOVA — SERVICIUL FISCAL DE STAT", W / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.text("DECLARATIE IMPOZIT PE VENIT", W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Perioada: ${periodLabel(period)}`, margin, y);
  y += 7;

  const rows = [
    ["Venituri totale", payload.vat_collected_cents ?? 0],
    ["Cheltuieli deductibile", payload.vat_deductible_cents ?? 0],
    ["Baza impozabila", payload.income_tax_base_cents ?? 0],
    [`Cota impozit (${payload.income_tax_rate_pct ?? 0}%)`, 0],
    ["IMPOZIT DE PLATA", payload.income_tax_cents ?? 0],
  ];

  doc.line(margin, y, W - margin, y);
  y += 5;
  for (const [label, cents] of rows) {
    const isBold = String(label).startsWith("IMPOZIT");
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(String(label), margin, y);
    if (cents !== 0) doc.text(fmtLei(cents as number) + " MDL", W - margin, y, { align: "right" });
    y += 7;
  }

  doc.line(margin, y, W - margin, y);
  y += 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Contabil autorizat: _________________________________", margin, y);

  return Buffer.from(doc.output("arraybuffer"));
}

// ─── CSV generators ───────────────────────────────────────────────────────────

/**
 * Generează CSV D394-RO (declarație informativă livrări/achiziții, ANAF România).
 * Coloane: CIF_FURNIZOR, DENUMIRE_FURNIZOR, NR_FACTURA, DATA_FACTURA, VALOARE_FARA_TVA, TVA_COLECTAT
 */
export function generateD394Csv(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  payload: TaxPayload
): string {
  const header = [
    "CIF_FURNIZOR",
    "DENUMIRE_FURNIZOR",
    "NR_FACTURA",
    "DATA_FACTURA",
    "VALOARE_FARA_TVA",
    "TVA_COLECTAT",
  ].map(csvCell).join(",");

  const lines: string[] = [header];

  // Dacă payload-ul conține linii de facturi detaliate, le folosim
  const invoiceLines = payload.invoice_lines ?? [];

  if (invoiceLines.length > 0) {
    for (const inv of invoiceLines) {
      lines.push([
        csvCell(inv.supplier_cif ?? ""),
        csvCell(inv.supplier_name ?? ""),
        csvCell(inv.invoice_number ?? ""),
        csvCell(inv.invoice_date ?? ""),
        csvCell(((inv.base_cents ?? 0) / 100).toFixed(2)),
        csvCell(((inv.vat_cents ?? 0) / 100).toFixed(2)),
      ].join(","));
    }
  } else {
    // Fallback: un singur rând sumar cu datele din payload
    lines.push([
      csvCell(""),
      csvCell(`Total ${periodLabel(period)}`),
      csvCell(""),
      csvCell(period.startDate),
      csvCell(((payload.vat_collected_cents ?? 0) / 100 / 1.19).toFixed(2)), // baza = total / 1.19
      csvCell(((payload.vat_collected_cents ?? 0) / 100).toFixed(2)),
    ].join(","));
  }

  return csvWithBom(lines);
}

/**
 * Generează CSV D301-RO (cerere ramburs TVA, ANAF România).
 * Un singur rând sumar cu: PERIOADA, BAZA_TVA, TVA_DATORAT, TVA_DEDUCTIBIL, DIFERENTA.
 */
export function generateD301Csv(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  payload: TaxPayload
): string {
  const header = [
    "PERIOADA",
    "BAZA_TVA",
    "TVA_DATORAT",
    "TVA_DEDUCTIBIL",
    "DIFERENTA",
  ].map(csvCell).join(",");

  const collected = payload.vat_collected_cents ?? 0;
  const deductible = payload.vat_deductible_cents ?? 0;
  const due = payload.vat_due_cents ?? 0;
  const base = Math.round(collected / 0.19); // baza aproximativă (19% RO)

  const dataRow = [
    csvCell(periodLabel(period)),
    csvCell((base / 100).toFixed(2)),
    csvCell((collected / 100).toFixed(2)),
    csvCell((deductible / 100).toFixed(2)),
    csvCell((due / 100).toFixed(2)),
  ].join(",");

  return csvWithBom([header, dataRow]);
}

/**
 * Generează CSV TVA12-MD (format tabelar Moldova, alternativ la PDF).
 */
export function generateTva12MdCsv(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  payload: TaxPayload
): string {
  const header = ["INDICATOR", "SUMA_MDL"].map(csvCell).join(",");

  const rows = [
    ["TVA colectat", ((payload.vat_collected_cents ?? 0) / 100).toFixed(2)],
    ["TVA deductibil", ((payload.vat_deductible_cents ?? 0) / 100).toFixed(2)],
    ["TVA de plata", ((payload.vat_due_cents ?? 0) / 100).toFixed(2)],
    ["Baza impozit venit", ((payload.income_tax_base_cents ?? 0) / 100).toFixed(2)],
    [`Impozit venit (${payload.income_tax_rate_pct ?? 0}%)`, ((payload.income_tax_cents ?? 0) / 100).toFixed(2)],
    ["Perioada", periodLabel(period)],
    ["Nr. declaratie", declaration.id.slice(0, 8).toUpperCase()],
  ];

  const lines = [header, ...rows.map(([ind, val]) => [csvCell(ind), csvCell(val)].join(","))];
  return csvWithBom(lines);
}

// ─── Router function — dispatches by type + format ───────────────────────────

export type ExportFormat = "pdf" | "csv";

export interface GenerateResult {
  data: Buffer | string;
  contentType: string;
  filename: string;
}

/**
 * Punctul de intrare principal — generează PDF sau CSV pentru orice tip de declarație.
 * Returnează `{ data, contentType, filename }` — apelantul setează headerele HTTP.
 */
export function generateDeclaration(
  declaration: FinTaxDeclaration,
  period: FinTaxPeriod,
  format: ExportFormat
): GenerateResult {
  const payload = (declaration.payload as TaxPayload) ?? {};
  const pLabel = periodLabel(period).replace(/\s/g, "-");
  const type = declaration.declarationType;

  if (format === "pdf") {
    let pdfBuf: Buffer;
    if (type === "tva12_md" || type === "income_md") {
      pdfBuf =
        type === "tva12_md"
          ? generateTva12MdPdf(declaration, period, payload)
          : generateIncomeMdPdf(declaration, period, payload);
    } else {
      // D394-RO și D301-RO nu au format PDF standard; generăm un PDF simplu cu sumarul
      pdfBuf = generateTva12MdPdf(declaration, period, payload);
    }
    return {
      data: pdfBuf,
      contentType: "application/pdf",
      filename: `${type}-${pLabel}.pdf`,
    };
  }

  // CSV
  let csvStr: string;
  if (type === "d394_ro") {
    csvStr = generateD394Csv(declaration, period, payload);
  } else if (type === "d301_ro") {
    csvStr = generateD301Csv(declaration, period, payload);
  } else {
    csvStr = generateTva12MdCsv(declaration, period, payload);
  }

  return {
    data: csvStr,
    contentType: "text/csv; charset=utf-8",
    filename: `${type}-${pLabel}.csv`,
  };
}
