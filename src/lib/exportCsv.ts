/**
 * CX-704 — CSV export utility for cohort participants
 *
 * Columns: Nr., Nume Prenume, Email, Telefon, WhatsApp (Da/Nu), Sumă (EUR), Status, Sursa
 * Status labels (RO): full→"Achitat Full", half→"Achitat 1/2", pending→"Cont Plată", free→"Gratuit"
 */

export type ParticipantRow = {
  fullName: string;
  email: string | null | undefined;
  phone: string | null | undefined;
  whatsappJoined: boolean;
  amountCents: number;
  paymentStatus: "full" | "half" | "pending" | "free" | null | undefined;
  source: "crm" | "manual";
};

const STATUS_LABELS: Record<string, string> = {
  full: "Achitat Full",
  half: "Achitat 1/2",
  pending: "Cont Plată",
  free: "Gratuit",
};

/**
 * Escape a single CSV field value:
 * - Always wrap in double-quotes
 * - Escape internal double-quotes by doubling them
 * - Handles newlines correctly (enclosed in quotes)
 */
export function escapeCsvField(value: string): string {
  // Replace every " with ""
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Format amount from cents to EUR string (integer display).
 * e.g. 12000 → "120"
 */
export function formatAmountEur(cents: number): string {
  return String(Math.round(cents / 100));
}

/**
 * Map payment status to Romanian label.
 */
export function mapStatus(status: string | null | undefined): string {
  if (!status) return "Manual";
  return STATUS_LABELS[status] ?? "Manual";
}

export interface ExportCsvOptions {
  /** Cohort course name, used in filename */
  courseName: string;
  /** Cohort edition label, used in filename */
  editionLabel: string;
  participants: ParticipantRow[];
}

const HEADERS = [
  "Nr.",
  "Nume Prenume",
  "Email",
  "Telefon",
  "WhatsApp (Da/Nu)",
  "Sumă (EUR)",
  "Status",
  "Sursa",
];

/**
 * Build a RFC-4180-compliant CSV string.
 */
export function buildCsvString(participants: ParticipantRow[]): string {
  const headerLine = HEADERS.map(escapeCsvField).join(",");

  const rows = participants.map((p, idx) => {
    const nr = String(idx + 1);
    const whatsapp = p.whatsappJoined ? "Da" : "Nu";
    const amount = formatAmountEur(p.amountCents);
    const status = mapStatus(p.paymentStatus);
    const source = p.source === "crm" ? "CRM" : "Manual";

    return [
      escapeCsvField(nr),
      escapeCsvField(p.fullName),
      escapeCsvField(p.email ?? ""),
      escapeCsvField(p.phone ?? ""),
      escapeCsvField(whatsapp),
      escapeCsvField(amount),
      escapeCsvField(status),
      escapeCsvField(source),
    ].join(",");
  });

  return [headerLine, ...rows].join("\r\n");
}

/**
 * Sanitize a string for use in a filename (remove characters that are
 * invalid on major platforms: / \ : * ? " < > | and control chars).
 */
function sanitizeFilename(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_").trim();
}

/**
 * Trigger a browser download of the CSV.
 * Filename format: {courseName}_{editionLabel}_cursanti.csv
 */
export function downloadCsv(options: ExportCsvOptions): void {
  const csv = buildCsvString(options.participants);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;

  const safeCourse = sanitizeFilename(options.courseName);
  const safeEdition = sanitizeFilename(options.editionLabel);
  link.download = `${safeCourse}_${safeEdition}_cursanti.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
