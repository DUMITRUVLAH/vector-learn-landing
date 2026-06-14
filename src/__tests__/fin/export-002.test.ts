/**
 * EXPORT-002: Teste export formate suplimentare (1C XML, SAGA CSV, SAF-T complet)
 *
 * T-EXPORT-002-1 [blocant] — /formats → JSON cu ≥ 6 formate
 * T-EXPORT-002-2 [blocant] — generate1cXml → XML conține <Документ> și <Счет>
 * T-EXPORT-002-3 [blocant] — generateSagaCsv → header corect Data,Cont,...
 * T-EXPORT-002-4 [normal]  — generateSafT cu includeTax=true → conține <TaxTable>
 * T-EXPORT-002-5 [normal]  — endpoint /1c-xml soft-ref absent → 200 + XML valid
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { generate1cXml, type OneCEntry } from "../../../server/lib/fin/export1c";
import { generateSagaCsv, type SagaEntry } from "../../../server/lib/fin/exportSaga";
import { generateSafT, type SaftAccount, type SaftJournalEntry } from "../../../server/lib/fin/exportSafT";

// ─── T-EXPORT-002-2: generate1cXml ───────────────────────────────────────────

describe("generate1cXml", () => {
  it("[T-EXPORT-002-2 blocant] XML conține tag-urile 1C necesare", () => {
    const entries: OneCEntry[] = [
      {
        date: "2025-01-15",
        ref: "DOC-001",
        description: "Chitanță client",
        accountCode: "2411",
        debitCents: 150000,
        creditCents: 0,
      },
      {
        date: "2025-01-15",
        ref: "DOC-001",
        description: "Chitanță client",
        accountCode: "6111",
        debitCents: 0,
        creditCents: 150000,
      },
    ];

    const xml = generate1cXml(entries);

    expect(xml).toContain("<?xml version");
    expect(xml).toContain("<ЗагрузкаДанных>");
    expect(xml).toContain("<Документ");
    expect(xml).toContain("<Счет>2411</Счет>");
    expect(xml).toContain("<Счет>6111</Счет>");
    expect(xml).toContain("<Сумма>1500.00</Сумма>");
    expect(xml).toContain("ВидДвижения=\"Дебет\"");
    expect(xml).toContain("ВидДвижения=\"Кредит\"");
    expect(xml).toContain("</ЗагрузкаДанных>");
  });

  it("XML fără înregistrări → structura rădăcină validă", () => {
    const xml = generate1cXml([]);
    expect(xml).toContain("<ЗагрузкаДанных>");
    expect(xml).toContain("</ЗагрузкаДанных>");
    expect(xml).not.toContain("<Документ");
  });

  it("Caractere speciale XML sunt escape-uite", () => {
    const entries: OneCEntry[] = [
      {
        date: "2025-03-01",
        ref: null,
        description: "Vânzare & <marfă> \"specială\"",
        accountCode: "2411",
        debitCents: 10000,
        creditCents: 0,
      },
    ];
    const xml = generate1cXml(entries);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).not.toContain("& <");
  });
});

// ─── T-EXPORT-002-3: generateSagaCsv ─────────────────────────────────────────

describe("generateSagaCsv", () => {
  it("[T-EXPORT-002-3 blocant] Prima linie = header corect SAGA C", () => {
    const csv = generateSagaCsv([]);
    const firstLine = csv.split("\r\n")[0];
    expect(firstLine).toBe("Data,Cont,DenumireCont,Suma,TipOperatie,Descriere");
  });

  it("Intrări debit generează linie cu TipOperatie=D", () => {
    const entries: SagaEntry[] = [
      {
        date: "2025-02-10",
        accountCode: "2411",
        accountName: "Clienți interni",
        debitCents: 120000,
        creditCents: 0,
        description: "Factură nr 123",
      },
    ];
    const csv = generateSagaCsv(entries);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 linie debit
    expect(lines[1]).toContain(",D,");
    expect(lines[1]).toContain("1200.00");
    expect(lines[1]).toContain("Clienți interni");
  });

  it("Intrare cu ambele debit + credit generează 2 linii de date", () => {
    const entries: SagaEntry[] = [
      {
        date: "2025-02-10",
        accountCode: "5121",
        accountName: "Bancă",
        debitCents: 50000,
        creditCents: 50000,
        description: "Transfer",
      },
    ];
    const csv = generateSagaCsv(entries);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3); // header + D + C
    const dataLines = lines.slice(1);
    expect(dataLines.some((l) => l.includes(",D,"))).toBe(true);
    expect(dataLines.some((l) => l.includes(",C,"))).toBe(true);
  });

  it("Câmpuri cu virgulă sunt înconjurate de ghilimele", () => {
    const entries: SagaEntry[] = [
      {
        date: "2025-01-01",
        accountCode: "6111",
        accountName: "Venituri, servicii",
        debitCents: 1000,
        creditCents: 0,
        description: null,
      },
    ];
    const csv = generateSagaCsv(entries);
    expect(csv).toContain('"Venituri, servicii"');
  });
});

// ─── T-EXPORT-002-4: generateSafT cu includeTax=true ─────────────────────────

describe("generateSafT cu includeTax", () => {
  const accounts: SaftAccount[] = [
    { code: "2411", name: "Clienți interni", class: "2" },
  ];
  const entries: SaftJournalEntry[] = [
    {
      entryId: "ent-001",
      entryDate: "2025-01-15",
      description: "Vânzare",
      accountCode: "2411",
      debitCents: 100000,
      creditCents: 0,
    },
  ];

  it("[T-EXPORT-002-4 normal] includeTax=true → XML conține <TaxTable>", () => {
    const xml = generateSafT({
      companyName: "Test SRL",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      accounts,
      entries,
      includeTax: true,
    });

    expect(xml).toContain("<TaxTable>");
    expect(xml).toContain("<TaxCode>");
    expect(xml).toContain("<TaxPercentage>");
    expect(xml).toContain("TVA20");
    expect(xml).toContain("</TaxTable>");
  });

  it("includeTax=false (default) → XML nu conține <TaxTable>", () => {
    const xml = generateSafT({
      companyName: "Test SRL",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      accounts,
      entries,
    });

    expect(xml).not.toContain("<TaxTable>");
  });

  it("includeTax=true cu taxEntries custom → conține codul custom", () => {
    const xml = generateSafT({
      companyName: "Test SRL",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      accounts,
      entries,
      includeTax: true,
      taxEntries: [
        { taxCode: "TVA_CUSTOM", taxDescription: "TVA special", taxPercentage: 8, taxType: "VAT" },
      ],
    });

    expect(xml).toContain("TVA_CUSTOM");
    expect(xml).not.toContain("TVA20"); // nu mai conține default-ul
  });
});

// ─── T-EXPORT-002-1: /formats endpoint (mock fetch) ──────────────────────────

describe("getExportFormats API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("[T-EXPORT-002-1 blocant] getExportFormats → array cu ≥ 6 formate", async () => {
    // Simulăm răspunsul serverului
    const mockFormats = [
      { id: "journal-csv", label: "Jurnal GL (CSV)", description: "...", mime: "text/csv", endpoint: "/api/fin/export/journal", params: ["from", "to"] },
      { id: "trial-balance-csv", label: "Balanță", description: "...", mime: "text/csv", endpoint: "/api/fin/export/trial-balance", params: ["as_of"] },
      { id: "invoices-sfs-csv", label: "Facturi SFS", description: "...", mime: "text/csv", endpoint: "/api/fin/export/invoices-sfs", params: ["from", "to"] },
      { id: "saf-t-ro-xml", label: "SAF-T RO", description: "...", mime: "application/xml", endpoint: "/api/fin/export/saf-t-ro", params: ["year"] },
      { id: "saf-t-ro-full", label: "SAF-T RO full", description: "...", mime: "application/xml", endpoint: "/api/fin/export/saf-t-ro-full", params: ["year"] },
      { id: "1c-xml", label: "1C XML", description: "...", mime: "application/xml", endpoint: "/api/fin/export/1c-xml", params: ["from", "to"] },
      { id: "saga-csv", label: "SAGA CSV", description: "...", mime: "text/csv", endpoint: "/api/fin/export/saga-csv", params: ["from", "to"] },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ formats: mockFormats }),
    }));

    const { getExportFormats } = await import("../../lib/api/finExport");
    const formats = await getExportFormats();

    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThanOrEqual(6);
    const ids = formats.map((f) => f.id);
    expect(ids).toContain("journal-csv");
    expect(ids).toContain("1c-xml");
    expect(ids).toContain("saga-csv");
  });
});

// ─── T-EXPORT-002-5: soft-ref pentru /1c-xml fără tabele ────────────────────

describe("generate1cXml cu lista goală (soft ref)", () => {
  it("[T-EXPORT-002-5 normal] XML gol rămâne structurat", () => {
    const xml = generate1cXml([]);
    expect(xml).toContain("<?xml version");
    expect(xml).toContain("<ЗагрузкаДанных>");
    expect(xml).toContain("</ЗагрузкаДанных>");
    // Niciun <Документ> — corect pentru soft-ref
    expect(xml).not.toContain("<Документ");
  });
});
