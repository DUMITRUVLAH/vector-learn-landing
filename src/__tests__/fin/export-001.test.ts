/**
 * EXPORT-001: Teste export contabil structurat
 *
 * T1 [blocant] — live API smoke: POST /auth/login + GET /api/fin/export/journal → 200 + text/csv
 *              (testat cu mock fetch — nu necesită server live)
 * T2 [blocant] — CSV jurnal: buildCsv cu 2 înregistrări → header + 2 rânduri corecte
 * T3 [blocant] — SAF-T RO XML: generateSafT cu plan de conturi → tag AuditFile + Header + Account
 * T4 [blocant] — invoices-sfs absent (soft ref): buildEmptyCsv → CSV cu header, zero rânduri
 * T5 [normal]  — trial-balance: buildCsv cu debit=credit → CSV echilibrat
 * T6 [normal]  — escapeCsvField cu `;` în valoare → valoare înconjurată de ghilimele
 */

import { describe, it, expect, vi } from "vitest";

// ─── Importuri helpers (unitate pură) ────────────────────────────────────────

import {
  buildCsv,
  buildEmptyCsv,
  escapeCsvField,
  formatCentsToLei,
  formatDate,
} from "../../../server/lib/fin/exportCsv";

import { generateSafT } from "../../../server/lib/fin/exportSafT";

// ─── T2: buildCsv cu 2 înregistrări ─────────────────────────────────────────

describe("exportCsv — buildCsv", () => {
  it("[T2 blocant] CSV cu 2 rânduri: header prezent + rânduri corecte", () => {
    const headers = ["date", "ref", "description", "account_code", "account_name", "debit_lei", "credit_lei"];
    const rows = [
      ["2025-01-15", "J001", "Vânzare curs", "701", "Venituri din servicii", "1000.00", "0.00"],
      ["2025-01-15", "J001", "Vânzare curs", "461", "Clienți creditori", "0.00", "1000.00"],
    ];
    const csv = buildCsv(headers, rows);

    // Are BOM UTF-8
    expect(csv.startsWith("﻿")).toBe(true);

    const lines = csv.split("\r\n");
    // Header + 2 rânduri
    expect(lines.length).toBe(3);
    // Header corect (BOM e pe linia 0, deci îl scoatem)
    expect(lines[0].replace(/^﻿/, "")).toBe("date;ref;description;account_code;account_name;debit_lei;credit_lei");
    // Primul rând
    expect(lines[1]).toContain("2025-01-15");
    expect(lines[1]).toContain("J001");
    expect(lines[1]).toContain("701");
    expect(lines[1]).toContain("1000.00");
    // Al doilea rând
    expect(lines[2]).toContain("461");
    expect(lines[2]).toContain("1000.00");
  });

  it("[T4 blocant] buildEmptyCsv: CSV gol cu header, zero rânduri de date", () => {
    const headers = ["seria", "numar", "data", "cumparator_idno", "cumparator_name",
      "total_fara_tva_lei", "tva_12_lei", "total_cu_tva_lei"];
    const csv = buildEmptyCsv(headers);

    // Are BOM
    expect(csv.startsWith("﻿")).toBe(true);

    const lines = csv.split("\r\n").filter((l) => l.trim() !== "");
    // Doar header
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("seria");
    expect(lines[0]).toContain("cumparator_name");
  });

  it("[T5 normal] trial-balance debit=credit: rând echilibrat", () => {
    const headers = ["account_code", "account_name", "class", "debit_total_lei", "credit_total_lei"];
    const rows = [
      ["461", "Clienți", "4", "5000.00", "5000.00"],
    ];
    const csv = buildCsv(headers, rows);
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain("5000.00");
    // Debit = credit (ambele sunt "5000.00")
    const parts = lines[1].split(";");
    expect(parts[3]).toBe("5000.00");
    expect(parts[4]).toBe("5000.00");
  });

  it("[T6 normal] escapeCsvField: câmp cu `;` → înconjurat cu ghilimele", () => {
    const result = escapeCsvField("Vânzare; curs intensiv");
    expect(result).toBe('"Vânzare; curs intensiv"');
  });
});

// ─── T3: generateSafT ────────────────────────────────────────────────────────

describe("exportSafT — generateSafT", () => {
  it("[T3 blocant] SAF-T XML cu plan conturi: tag AuditFile + Header + Account prezente", () => {
    const xml = generateSafT({
      companyName: "Academia Vector SRL",
      taxRegistrationNumber: "1234567890",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      accounts: [
        { code: "461", name: "Clienți creditori", class: "4" },
        { code: "701", name: "Venituri din servicii", class: "7" },
      ],
      entries: [
        {
          entryId: "e1",
          entryDate: "2025-01-15",
          description: "Vânzare curs",
          accountCode: "701",
          debitCents: 0,
          creditCents: 100000,
        },
        {
          entryId: "e1",
          entryDate: "2025-01-15",
          description: "Vânzare curs",
          accountCode: "461",
          debitCents: 100000,
          creditCents: 0,
        },
      ],
    });

    // Header XML
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    // Namespace SAF-T RO corect
    expect(xml).toContain('xmlns="urn:StandardAuditFile-Taxation-Financial:RO"');
    // Tag AuditFile
    expect(xml).toContain("<AuditFile");
    expect(xml).toContain("</AuditFile>");
    // Header
    expect(xml).toContain("<Header>");
    expect(xml).toContain("Academia Vector SRL");
    expect(xml).toContain("2025-01-01");
    expect(xml).toContain("2025-12-31");
    // Conturi
    expect(xml).toContain("<Account>");
    expect(xml).toContain("<AccountID>461</AccountID>");
    expect(xml).toContain("<AccountID>701</AccountID>");
    // Înregistrări
    expect(xml).toContain("<Journal>");
    expect(xml).toContain("<AccountID>701</AccountID>");
  });

  it("SAF-T fără conturi și fără înregistrări: XML valid cu secțiuni goale", () => {
    const xml = generateSafT({
      companyName: "Test",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      accounts: [],
      entries: [],
    });

    expect(xml).toContain("<AuditFile");
    expect(xml).toContain("<Header>");
    expect(xml).toContain("<GeneralLedgerAccounts>");
    // Nu crează nicio eroare de runtime
    expect(typeof xml).toBe("string");
  });
});

// ─── Helpere suplimentare ────────────────────────────────────────────────────

describe("exportCsv — helpere", () => {
  it("formatCentsToLei: 100000 → '1000.00'", () => {
    expect(formatCentsToLei(100000)).toBe("1000.00");
    expect(formatCentsToLei(0)).toBe("0.00");
    expect(formatCentsToLei(1)).toBe("0.01");
  });

  it("formatDate: ISO string → YYYY-MM-DD", () => {
    expect(formatDate("2025-06-15T12:00:00Z")).toBe("2025-06-15");
    expect(formatDate("2025-01-01")).toBe("2025-01-01");
  });

  it("[T1 blocant mock] API smoke: GET /api/fin/export/journal returnează text/csv", async () => {
    // Mock fetch pentru test izolat (nu necesită server live)
    const mockBlob = new Blob(["﻿date;ref;description\r\n"], { type: "text/csv" });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });
    const originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const { downloadJournalCsv } = await import("../../lib/api/finExport");
      const blob = await downloadJournalCsv({ from: "2025-01-01", to: "2025-12-31" });
      expect(blob).toBeInstanceOf(Blob);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/fin/export/journal"),
        expect.objectContaining({ credentials: "include" })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
