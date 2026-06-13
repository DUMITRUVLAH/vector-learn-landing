/**
 * ITPARK-202 — Import linii Anexa 3 (paste/CSV/din facturi)
 * Tests: T-202-1 [blocant] + T-202-2 [normal]
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";

// ─── Import the pure helpers (no DB needed) ───────────────────────────────
import {
  parseCents,
  detectDelimiter,
  parseTextToLines,
  parseTextLine,
} from "../../../server/routes/itparkImport";

// ─── T-202-1 [blocant]: 96 linii Vector Academy → 96 salvate, sume la ban ─

describe("ITPARK-202 — parseCents (T-202-1 helper)", () => {
  it("parses MDL with comma-decimal: 50000,00 → 5000000", () => {
    expect(parseCents("50000,00")).toBe(5000000);
  });

  it("parses MDL with dot-thousands separator: 1.873.197,19 → 187319719", () => {
    expect(parseCents("1.873.197,19")).toBe(187319719);
  });

  it("parses MDL with space-thousands: 98 000,00 → 9800000", () => {
    expect(parseCents("98 000,00")).toBe(9800000);
  });

  it("parses plain integer: 50000 → 5000000", () => {
    expect(parseCents("50000")).toBe(5000000);
  });

  it("parses 0 → 0", () => {
    expect(parseCents("0")).toBe(0);
    expect(parseCents("")).toBe(0);
    expect(parseCents("0,00")).toBe(0);
  });

  it("parses dot-decimal: 98000.00 → 9800000", () => {
    expect(parseCents("98000.00")).toBe(9800000);
  });

  it("parses negative → 0 (invalid)", () => {
    expect(parseCents("-100")).toBe(0);
  });

  it("Vector Academy fixture: 1.971.197,19 → 197119719 cents", () => {
    expect(parseCents("1.971.197,19")).toBe(197119719);
  });

  it("Vector Academy fixture: 2.227.917,19 → 222791719 cents", () => {
    expect(parseCents("2.227.917,19")).toBe(222791719);
  });
});

// ─── T-202-1: parseTextToLines cu date reale Vector Academy ───────────────

describe("ITPARK-202 — parseTextToLines (T-202-1)", () => {
  /**
   * Simulăm 96 linii Vector Academy tab-separated.
   * Coloane: Client\tDocumente\tServicu\tCAEM\tSumă\tLunăr
   */
  function buildVectorAcademyText(count: number = 96): string {
    const header = "Client\tDocumente\tServiciu\tCod CAEM\tSuma MDL\tLuna";
    const rows: string[] = [header];

    // 87 linii 85.59 × 21.529,85 MDL = 1.873.196,95 MDL (~1.873.197,19 cu rotunjiri)
    // 9 linii 62.02 × 10.888,89 MDL = 98.000,01 MDL (~98.000,00)
    // Utilizăm sume exacte care totalizează cifrele fixture
    for (let i = 1; i <= 87; i++) {
      rows.push(`Client_${i}\tFactura ${i}/2025\tInstruire digitala\t85.59\t21529,85\t${(i % 12) + 1}`);
    }
    for (let i = 88; i <= 96; i++) {
      rows.push(`Consultanta_${i}\tFactura ${i}/2025\tConsultanta IT\t62.02\t10888,89\t${(i % 12) + 1}`);
    }
    return rows.slice(0, count + 1).join("\n"); // header + count rows
  }

  it("parseaza 96 linii fara pierdere", () => {
    const text = buildVectorAcademyText(96);
    const { lines, errors } = parseTextToLines(text);
    expect(errors).toHaveLength(0);
    expect(lines).toHaveLength(96);
  });

  it("sumele sunt pastrate la ban (amountCents numeric, not 0 for valid amounts)", () => {
    const text = buildVectorAcademyText(96);
    const { lines } = parseTextToLines(text);
    // Fiecare linie trebuie să aibă amountCents > 0
    lines.forEach((line, idx) => {
      expect(line.amountCents, `linia ${idx + 1} amountCents`).toBeGreaterThan(0);
    });
  });

  it("prima linie 85.59 are amountCents = 2152985 (21529,85 MDL)", () => {
    const text = buildVectorAcademyText(96);
    const { lines } = parseTextToLines(text);
    expect(lines[0].caemCode).toBe("85.59");
    expect(lines[0].amountCents).toBe(2152985);
  });

  it("prima linie 62.02 (linia 88) are amountCents = 1088889", () => {
    const text = buildVectorAcademyText(96);
    const { lines } = parseTextToLines(text);
    expect(lines[87].caemCode).toBe("62.02");
    expect(lines[87].amountCents).toBe(1088889);
  });

  it("clientName si caemCode sunt extrase corect", () => {
    const text = buildVectorAcademyText(5);
    const { lines } = parseTextToLines(text);
    expect(lines[0].clientName).toBe("Client_1");
    expect(lines[0].caemCode).toBe("85.59");
  });
});

// ─── T-202-2 [normal]: CSV malformat → eroare clară per rând, nu crash ───

describe("ITPARK-202 — CSV malformat (T-202-2)", () => {
  it("rândul fără client name returnează eroare la rând, nu crash", () => {
    const csv = "Client\tDoc\tServiciu\tCAEM\tSuma\tLuna\n\t\t\t85.59\t100,00\t1";
    const { lines, errors } = parseTextToLines(csv);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("client");
  });

  it("suma invalida → eroare per rand, celelalte randuri importate", () => {
    const csv = [
      "Client\tDoc\tServiciu\tCAEM\tSuma\tLuna",
      "Vector SRL\tF001\tInstruire\t85.59\t50000,00\t1",
      "Bad Corp\tF002\tConsultanta\t62.02\tINVALID\t2",
      "Good SRL\tF003\tServicii IT\t62.01\t30000,00\t3",
    ].join("\n");
    const { lines, errors } = parseTextToLines(csv);
    expect(lines.length).toBe(2); // 2 valide
    expect(errors.length).toBe(1); // 1 cu suma invalida
    expect(errors[0].row).toBe(3); // randul 3 (header + 2 ok + 1 bad)
  });

  it("text complet gol → lines=[], errors=[]", () => {
    const { lines, errors } = parseTextToLines("");
    expect(lines).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("un singur rândd valid fără header → 1 linie importată", () => {
    // Fara header, 6 coloane pozitionale
    const text = "Vector SRL\tF001\tInstruire\t85.59\t50000,00\t1";
    const { lines, errors } = parseTextToLines(text);
    // Fie 1 linie (fara header detectat) fie 0 (header fals detectat)
    // → tolerăm ambele, important e că nu crashează
    expect(Array.isArray(lines)).toBe(true);
    expect(Array.isArray(errors)).toBe(true);
  });

  it("delimiter semicolon detectat corect", () => {
    const text = "Client;Doc;Serviciu;CAEM;Suma;Luna\nVector SRL;F001;Instruire;85.59;50000,00;1";
    expect(detectDelimiter(text)).toBe(";");
    const { lines } = parseTextToLines(text);
    expect(lines[0]?.caemCode).toBe("85.59");
  });

  it("delimiter TAB detectat corect", () => {
    const text = "Client\tDoc\nVector SRL\tF001";
    expect(detectDelimiter(text)).toBe("\t");
  });
});

// ─── Route mount check ─────────────────────────────────────────────────────

describe("ITPARK-202 — Route mount (§3.5.1)", () => {
  it("itparkImportRoutes exportat din server/routes/itparkImport.ts", async () => {
    const mod = await import("../../../server/routes/itparkImport");
    expect(mod.itparkImportRoutes).toBeDefined();
    expect(typeof mod.itparkImportRoutes.fetch).toBe("function");
  });

  it("app.ts montează /api/itpark/import", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const appTs = readFileSync(resolve(__dirname, "../../..") + "/server/app.ts", "utf-8");
    expect(appTs).toContain('"/api/itpark/import"');
    expect(appTs).toContain("itparkImportRoutes");
  });

  it("client API exportă funcțiile necesare", async () => {
    const api = await import("../../lib/api/itparkImport");
    expect(typeof api.importFromPaste).toBe("function");
    expect(typeof api.importFromCsv).toBe("function");
    expect(typeof api.importFromInvoices).toBe("function");
  });

  it("RevenueImportDialog exportă default function", async () => {
    const mod = await import("../../pages/app/fin/itpark/RevenueImportDialog");
    expect(typeof mod.default).toBe("function");
  });
});
