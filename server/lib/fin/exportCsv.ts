/**
 * EXPORT-001: Helpers pentru generare CSV contabil.
 *
 * - Delimiter: `;` (compatibil Excel RO/MD)
 * - Encoding: UTF-8 cu BOM (pentru deschidere corectă în Excel)
 * - Valori monetare: MDL cu 2 zecimale (ex: `1234.56`)
 * - Prima linie = header
 */

/** BOM UTF-8 pentru compatibilitate Excel RO/MD */
const UTF8_BOM = "﻿";

/**
 * Scapă o valoare CSV: dacă conține `;`, `"` sau newline, o înconjoară cu `"`.
 * Ghilimelele interne se dublează.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = neutralizeFormula(String(value));
  if (/[;"'\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * SECURITY (audit 2026-08-29) — injecție de formule în foaia de calcul.
 *
 * Excel și LibreOffice interpretează o celulă care începe cu `=`, `+`, `-`, `@` (sau TAB/CR) ca
 * formulă, nu ca text. Numele beneficiarului dintr-un PAR e adesea extras de AI dintr-un PDF
 * trimis din exterior, deci un „furnizor" putea pune `=WEBSERVICE(...)` sau o formulă DDE în
 * numele lui, iar exportul deschis de contabilitate o executa pe stația lor. Prefixul cu apostrof
 * e convenția care spune „asta e text": se vede la fel în celulă, dar nu se mai evaluează.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Formatează un număr de cenți în lei cu 2 zecimale */
export function formatCentsToLei(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Formatează o dată ISO la YYYY-MM-DD */
export function formatDate(isoDate: string | Date): string {
  const d = typeof isoDate === "string" ? isoDate : isoDate.toISOString();
  return d.slice(0, 10);
}

/** Construiește un CSV complet din header + rânduri */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvField).join(";"));
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(";"));
  }
  return UTF8_BOM + lines.join("\r\n");
}

/** Construiește un CSV cu BOM din header + zero rânduri (pentru soft-reference absent) */
export function buildEmptyCsv(headers: string[]): string {
  return UTF8_BOM + headers.map(escapeCsvField).join(";") + "\r\n";
}
