/**
 * CX-704 — exportCsv utility tests
 *
 * T-CX-704-1: export 2 participants → CSV has header + 2 rows, correct columns
 * T-CX-704-2: name with comma/quote → valid escaping (round-trip parse)
 * T-CX-704-3: pending status → "Cont Plată"; 12000 cents → "120"
 */
import { describe, it, expect } from "vitest";
import {
  buildCsvString,
  escapeCsvField,
  formatAmountEur,
  mapStatus,
  type ParticipantRow,
} from "@/lib/exportCsv";

/** Minimal RFC-4180 CSV parser for round-trip verification */
function parseCsv(csv: string): string[][] {
  const lines = csv.split("\r\n");
  return lines.map((line) => {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let field = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            field += line[i++];
          }
        }
        fields.push(field);
        if (line[i] === ",") i++;
      } else {
        // Unquoted field (bare, ends at comma or EOL)
        let j = line.indexOf(",", i);
        if (j === -1) j = line.length;
        fields.push(line.slice(i, j));
        i = j + 1;
      }
    }
    return fields;
  });
}

const makeParticipant = (
  overrides: Partial<ParticipantRow> = {}
): ParticipantRow => ({
  fullName: "Ionescu Ana",
  email: "ana@test.com",
  phone: "+40700000001",
  whatsappJoined: true,
  amountCents: 20000,
  paymentStatus: "full",
  source: "manual",
  ...overrides,
});

describe("escapeCsvField", () => {
  it("wraps value in double quotes", () => {
    expect(escapeCsvField("hello")).toBe('"hello"');
  });

  it("doubles internal double-quotes", () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("handles commas inside quotes", () => {
    const result = escapeCsvField("Popescu, Ion");
    expect(result).toBe('"Popescu, Ion"');
  });
});

describe("formatAmountEur", () => {
  it("converts cents to EUR integer string", () => {
    expect(formatAmountEur(12000)).toBe("120");
    expect(formatAmountEur(0)).toBe("0");
    expect(formatAmountEur(15050)).toBe("151"); // rounds
  });
});

describe("mapStatus", () => {
  it("maps full → Achitat Full", () => {
    expect(mapStatus("full")).toBe("Achitat Full");
  });
  it("maps half → Achitat 1/2", () => {
    expect(mapStatus("half")).toBe("Achitat 1/2");
  });
  it("maps pending → Cont Plată", () => {
    expect(mapStatus("pending")).toBe("Cont Plată");
  });
  it("maps free → Gratuit", () => {
    expect(mapStatus("free")).toBe("Gratuit");
  });
  it("maps null → Manual", () => {
    expect(mapStatus(null)).toBe("Manual");
  });
  it("maps unknown string → Manual", () => {
    expect(mapStatus("xyz")).toBe("Manual");
  });
});

// ─── T-CX-704-1 ───────────────────────────────────────────────────────────────

describe("T-CX-704-1: export 2 participants → header + 2 rows", () => {
  it("produces exactly 3 lines (header + 2 data rows)", () => {
    const participants = [makeParticipant(), makeParticipant({ fullName: "Popa Dan" })];
    const csv = buildCsvString(participants);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
  });

  it("header contains all 8 expected column names", () => {
    const csv = buildCsvString([makeParticipant()]);
    const parsed = parseCsv(csv);
    const header = parsed[0];
    expect(header).toEqual([
      "Nr.",
      "Nume Prenume",
      "Email",
      "Telefon",
      "WhatsApp (Da/Nu)",
      "Sumă (EUR)",
      "Status",
      "Sursa",
    ]);
  });

  it("first data row has correct Nr. value", () => {
    const csv = buildCsvString([makeParticipant(), makeParticipant()]);
    const parsed = parseCsv(csv);
    expect(parsed[1][0]).toBe("1");
    expect(parsed[2][0]).toBe("2");
  });
});

// ─── T-CX-704-2 ───────────────────────────────────────────────────────────────

describe('T-CX-704-2: name with comma/quote → escaping valid (round-trip)', () => {
  it('handles comma in full name', () => {
    const p = makeParticipant({ fullName: "Popescu, Ion" });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    // Header + 1 row
    expect(parsed[1][1]).toBe("Popescu, Ion");
  });

  it('handles double-quote in full name', () => {
    const p = makeParticipant({ fullName: 'Ion "Nicu" Popa' });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    expect(parsed[1][1]).toBe('Ion "Nicu" Popa');
  });

  it('handles comma+quote combo in full name', () => {
    const p = makeParticipant({ fullName: 'Popa, "Ion"' });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    expect(parsed[1][1]).toBe('Popa, "Ion"');
  });
});

// ─── T-CX-704-3 ───────────────────────────────────────────────────────────────

describe("T-CX-704-3: status + amount mapping", () => {
  it("pending → Cont Plată in CSV data row", () => {
    const p = makeParticipant({ paymentStatus: "pending", amountCents: 12000 });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    const row = parsed[1];
    expect(row[6]).toBe("Cont Plată"); // Status column (index 6)
    expect(row[5]).toBe("120");        // Sumă EUR column (index 5)
  });

  it("full → Achitat Full, amount 20000 → 200", () => {
    const p = makeParticipant({ paymentStatus: "full", amountCents: 20000 });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    const row = parsed[1];
    expect(row[6]).toBe("Achitat Full");
    expect(row[5]).toBe("200");
  });

  it("null status → Manual", () => {
    const p = makeParticipant({ paymentStatus: null });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    expect(parsed[1][6]).toBe("Manual");
  });

  it("free → Gratuit", () => {
    const p = makeParticipant({ paymentStatus: "free" });
    const csv = buildCsvString([p]);
    const parsed = parseCsv(csv);
    expect(parsed[1][6]).toBe("Gratuit");
  });

  it("crm source → CRM label, manual → Manual", () => {
    const csvCrm = buildCsvString([makeParticipant({ source: "crm" })]);
    const csvManual = buildCsvString([makeParticipant({ source: "manual" })]);
    expect(parseCsv(csvCrm)[1][7]).toBe("CRM");
    expect(parseCsv(csvManual)[1][7]).toBe("Manual");
  });

  it("whatsappJoined true → Da, false → Nu", () => {
    const csvDa = buildCsvString([makeParticipant({ whatsappJoined: true })]);
    const csvNu = buildCsvString([makeParticipant({ whatsappJoined: false })]);
    expect(parseCsv(csvDa)[1][4]).toBe("Da");
    expect(parseCsv(csvNu)[1][4]).toBe("Nu");
  });
});

describe("empty participants", () => {
  it("produces only the header line", () => {
    const csv = buildCsvString([]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1);
  });
});
