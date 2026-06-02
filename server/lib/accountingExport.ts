/**
 * PAY-008: Accounting export helpers.
 * Generates SAGA CSV and 1C tab-separated exports from payment/refund/payout data.
 */

export type AccountingRow = {
  date: string;         // YYYY-MM-DD
  type: "PL" | "NC" | "DP"; // PL=plată client, NC=notă credit(refund), DP=dispoziție plată(salariu)
  accountCode: string;
  description: string;
  amountCents: number;  // negative for refunds/NC
  currency: string;
  documentNumber: string;
  partner: string;
  tvaAmountCents?: number;
};

/**
 * Generate SAGA CSV (UTF-8 with BOM for Excel Romanian).
 * Columns: data, tip, articol_contabil, descriere, suma, moneda, nr_document, partener, tva
 */
export function generateSagaCsv(rows: AccountingRow[]): string {
  const BOM = "﻿";
  const header = "data,tip,articol_contabil,descriere,suma,moneda,nr_document,partener,tva";
  const lines = [header];

  for (const row of rows) {
    const suma = (row.amountCents / 100).toFixed(2);
    const tva = row.tvaAmountCents !== undefined ? (row.tvaAmountCents / 100).toFixed(2) : "0.00";
    const cells = [
      row.date,
      row.type,
      row.accountCode,
      escapeCsvCell(row.description),
      suma,
      row.currency,
      row.documentNumber,
      escapeCsvCell(row.partner),
      tva,
    ];
    lines.push(cells.join(","));
  }

  return BOM + lines.join("\r\n");
}

/**
 * Generate 1C tab-separated (no BOM).
 * Columns: Дата, Документ, Контрагент, Сумма, Валюта, Примечание
 */
export function generate1cCsv(rows: AccountingRow[]): string {
  const header = "Дата\tДокумент\tКонтрагент\tСумма\tВалюта\tПримечание";
  const lines = [header];

  for (const row of rows) {
    const suma = (row.amountCents / 100).toFixed(2);
    const cells = [
      row.date,
      row.documentNumber,
      row.partner,
      suma,
      row.currency,
      row.description,
    ];
    lines.push(cells.join("\t"));
  }

  return lines.join("\r\n");
}

/** Escape a CSV cell value: wrap in quotes if contains comma, quote, or newline */
export function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build description from a template string.
 * Supported placeholders: {description}, {partner}, {document}
 */
export function applyDescriptionTemplate(
  template: string,
  vars: { description?: string; partner?: string; document?: string }
): string {
  return template
    .replace("{description}", vars.description ?? "")
    .replace("{partner}", vars.partner ?? "")
    .replace("{document}", vars.document ?? "");
}
